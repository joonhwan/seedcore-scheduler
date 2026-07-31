# 단일 Executable 배포판의 DB 마이그레이션 설계

- 작성일: 2026-07-29
- 대상 마일스톤: M4 (에어갭 오프라인 배포 패키징)
- 상태: 구현 완료

---

## 1. 배경

`sp-server.exe` 배포판에는 **스키마를 진화시킬 방법이 없다.**

현재 exe 런타임의 DB 초기화는 `apps/api/src/prisma/prisma.service.ts` 의 `ensureSchema()` 가 담당한다.
이 함수는 `users` 테이블이 있는지만 확인하고, 있으면 아무 일도 하지 않는다.

```ts
// prisma.service.ts:20-23
const tables = await this.$queryRawUnsafe(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='users';",
);
if (tables.length === 0) {   // users 가 있으면 DDL 블록 전체를 건너뛴다
```

여기서 세 가지 문제가 나온다.

1. **기존 DB 가 절대 업그레이드되지 않는다.** 컬럼이 추가된 새 exe 를 배포해도 기존 `data/sam.db` 는
   그대로 남고, Prisma 가 새 컬럼을 조회하는 순간 런타임 에러가 난다.
2. **실패해도 서버가 뜬다.** `prisma.service.ts:153-155` 가 예외를 `logger.error` 로 삼키고 throw 하지 않는다.
   스키마가 깨진 상태로 부팅해서 첫 요청에서야 문제가 드러난다.
3. **DDL 이 이중 원본이다.** `ensureSchema()` 의 하드코딩 DDL 130여 줄과 `apps/api/prisma/migrations/` 가
   별개 원본이라 서로 어긋날 수 있다. 로컬 개발은 `prisma migrate dev` 경로를, exe 는 `ensureSchema()`
   경로를 타므로 두 환경의 스키마가 조용히 갈라진다.

### 왜 `prisma migrate deploy` 를 쓸 수 없는가

`prisma migrate deploy` 는 prisma CLI(Node 패키지) 와 `schema-engine` 바이너리를 필요로 하고,
런타임에 파일시스템에서 `schema.prisma` 와 `migrations/` 를 찾는다. pkg 단일 exe 안에 넣기가 매우 까다롭고,
결국 `dist-exe` 옆에 파일들을 풀어놓는 형태가 되어 "100% 자원 내장 단일 exe" 라는 현재 배포 목표와 충돌한다.

참고로 `schema-engine-windows.exe` 는 `node_modules` 에 존재하지만 `build-exe.js:110-118` 의 필터가
`query_engine` / `.dll.node` 만 잡기 때문에 `dist-exe` 로 복사되지 않는다.

---

## 2. 목표와 비목표

### 목표

- exe 배포판에서 스키마 변경을 안전하게 적용할 수 있다.
- **`prisma/migrations/` 를 단일 원본으로 만든다.** 로컬과 현장이 같은 SQL 을 사용한다.
- 스키마가 어긋난 상태로 서버가 절대 부팅하지 않는다.
- 현장 관리자가 터미널에서 읽고 그대로 따를 수 있는 한글 안내를 제공한다.

### 비목표

- 롤백(down migration) 지원. 복구는 사전 백업 파일로 되돌리는 방식이다.
- 웹 UI 를 통한 마이그레이션 실행.
- `_prisma_migrations` 없이 만들어진 기존 DB 의 자동 baseline. 현장 배포 이력이 없음을 확인했으므로
  이 경우는 **명시적으로 거부**한다 (§5 참고).

---

## 3. 운영 계약

`sp-server.exe` 는 **판정만** 하고, 실제 적용은 신규 `sp-migrate.exe` 가 담당한다.

| DB 상태 | 판정 방법 | `sp-server.exe` 동작 |
|---|---|---|
| 테이블 0개 (최초 실행) | `sqlite_master` 에서 `sqlite_%` 제외 테이블 수 = 0 | 전체 마이그레이션을 **직접 적용**하고 정상 부팅. 백업 없음 |
| 미적용분 있음 (업그레이드) | 이력 테이블과 파일 목록 비교 | 한글 안내 출력 후 **DB 를 건드리지 않고 종료** (exit 3) |
| 최신 | 미적용분 없음 | 그대로 부팅 |

최초 실행만 예외로 두는 근거: **잃을 데이터가 없는 유일한 상태**다. 백업이 필요 없고 실패해도 DB 파일을
삭제한 뒤 재시도하면 된다. 위험의 성질이 다르므로 규칙이 달라도 일관성이 깨지지 않는다.
또한 `README-exe.txt:22` 가 안내하는 "최초 실행 시 DB 자동 초기화" 1단계 UX 가 유지된다.

### 업그레이드 필요 시 출력

관리자는 `cmd.exe` / `wt.exe` 에서 서버를 기동한다. 프로세스가 이미 종료된 상태이므로
"창을 닫으라" 는 식의 안내는 쓰지 않고, 다음에 칠 명령을 그대로 보여준다.
`>` 프롬프트 표기는 `README-exe.txt` 의 기존 관례를 따른다.

```
====================================================
  데이터베이스 업그레이드가 필요합니다
====================================================

  적용되지 않은 변경사항 2건:
    - 20260801093000_add_attachment
    - 20260815112000_node_tags

  DB 는 변경하지 않았습니다. 서버도 시작하지 않았습니다.
  아래 두 명령을 차례로 실행하십시오.

    > sp-migrate.exe        DB 를 백업한 뒤 업그레이드합니다
    > sp-server.exe         업그레이드가 끝나면 서버를 시작합니다

====================================================
```

같은 안내를 **로그 파일에도 기록한다.** 관리자가 탐색기에서 더블클릭해 실행하면 콘솔 창이 순간적으로
닫혀 안내를 놓치기 때문이다. "키를 누르면 종료" 같은 대기 로직은 넣지 않는다 — 서비스 래퍼나
스크립트로 자동 기동할 때 프로세스가 멈춰버린다.

---

## 4. 구성 요소

마이그레이션 러너를 **NestJS 와 무관한 순수 모듈로 분리**한다. 그래야 `sp-server.exe`(판정용)와
`sp-migrate.exe`(적용용)가 같은 코드를 공유한다.

| 구성 요소 | 위치 | 역할 | 의존 |
|---|---|---|---|
| `MigrationRunner` | `apps/api/src/prisma/migration-runner.ts` (신규) | 이력 읽기, 미적용 목록 산출, 순차 적용, `VACUUM INTO` 스냅샷 | `PrismaClient` 인스턴스 + 디렉터리 경로. **Nest 의존 없음** |
| `resolveMigrationsDir()` | `apps/api/src/prisma/migration-runner.ts` | exe/로컬 양쪽에서 `migrations/` 위치 탐색 | `app.module.ts:26-30` 의 후보 경로 패턴 재사용 |
| `splitSqlStatements()` | `apps/api/src/prisma/sql-statements.ts` (신규) | `migration.sql` 을 실행 가능한 문장 배열로 분할 (문자열 리터럴/`--` 주석 처리) | 없음 (순수 함수) |
| **`decideBoot()`** | `apps/api/src/prisma/boot-decision.ts` (신규) | `sp-server.exe` 의 DB 상태 판정. 부작용 없이 `boot` / `apply` / `halt(exitCode, notice)` 판별 유니온을 돌려준다 | `MigrationRunner` + `migration-messages` |
| **`decideMigrate()`** | `apps/api/src/prisma/migrate-decision.ts` (신규) | `sp-migrate.exe` 의 DB 상태 판정. `decideBoot()` 과 **같은 판정 순서**를 거울처럼 유지한다 (다른 점은 빈 DB → exit 2) | `MigrationRunner` + `migration-messages` |
| `migration-messages.ts` | `apps/api/src/prisma/migration-messages.ts` (신규) | 관리자에게 보여줄 **모든 한글 안내 문구**를 한곳에 모은 순수 포매터. 문구 자체를 테스트로 고정한다 | 없음 (순수 함수) |
| `createMigrationClient()` | `apps/api/src/prisma/migration-client.ts` (신규) | `applyMigrations()` 에 넘길 client 를 항상 `connection_limit=1` 로 만든다 (§6 의 PRAGMA 단일 커넥션 요구를 생성 경로로 강제) | `PrismaClient` |
| `resolveDatabaseUrl()` | `apps/api/src/common/db-path.ts` (신규, `main.ts:13-20` 에서 추출) | DB 파일 경로 결정 | — |
| `appendPlainLog()` | `apps/api/src/common/plain-daily-log.ts` (신규) | Nest 없이 도는 `sp-migrate.exe` 가 `DailyLoggerService` 와 같은 파일/형식으로 로그를 남긴다 (§3 의 "로그 파일에도 기록" 요구) | 없음 |
| `PrismaService` | `apps/api/src/prisma/prisma.service.ts` (수정) | 부팅 시 `decideBoot()` 결과를 exit code / 출력으로 옮긴다. 빈 DB 면 직접 적용 | `decideBoot`, `MigrationRunner`, `createMigrationClient` |
| `migrate-main.ts` | `apps/api/src/migrate-main.ts` (신규) → `sp-migrate.exe` | `decideMigrate()` → 백업 → 적용 → 결과 리포트 | `decideMigrate`, `MigrationRunner`, `createMigrationClient` |
| `build-exe.js` | (수정) | `migrations/**` 를 pkg asset 으로 내장, `sp-migrate.exe` 번들 추가 | — |

**판정 계층(`boot-decision.ts` / `migrate-decision.ts`)이 이 설계의 중심이다.** 두 실행 파일이 같은 DB
상태를 보고 서로 다른 진단을 내리면 관리자는 상반된 지시를 받게 된다 — 실제로 한 번 그런 결함이
있었다("테이블 없음 + 적용 이력 있음 + 미적용분 있음" 상태를 `sp-migrate.exe` 는 exit 2, `sp-server.exe`
는 최초 실행으로 진단했다). 그래서 판정은 I/O 와 분리한 순수 함수로 두고, 두 파일이 **같은 순서로
같은 조건을 묻도록** 거울처럼 유지한다. 한쪽을 고치면 반드시 다른 쪽도 고치고, 양쪽 테스트 파일에
같은 상태의 테스트를 함께 추가한다.

`migrate-main.ts` 를 계획 당시 생각했던 `apps/api/scripts/` 가 아니라 `apps/api/src/` 에 둔 이유:
`build-exe.js` 는 `scripts/backup-cli.ts` 와 `scripts/reset-admin-cli.ts` 를 `npx tsc scripts/...`
형태로 **별도 `tsc` 호출**로 컴파일한다. 이 항목을 `scripts/` 에 두고 `../src/` 를 import 했다면
tsc 가 두 디렉터리를 모두 아우르도록 `rootDir` 를 추론해 출력 경로 구조가 바뀌고, 그 결과 ncc 가
기대하는 엔트리 경로(`dist/scripts/migrate-cli.js`)가 어긋났을 것으로 **예상된다** — 실제로 그
구성으로 빌드를 돌려서 깨지는 것을 확인한 것은 아니고, `tsc` 의 `rootDir` 자동 추론 규칙과
`build-exe.js` 의 두 컴파일 경로(3/5 의 개별 `tsc` 대 `nest build`)가 어떻게 상호작용할지를 미리
따져 본 결과다. 이 위험을 피하려고 처음부터 `src/migrate-main.ts` 로 뒀다. 그 경로는 `nest build` 가
만드는 `dist/migrate-main.js` 를 그대로 ncc 에 넘기면 되므로(§8 참고) 이 문제 자체가 생기지 않는다.

### `MigrationRunner` 인터페이스

내부의 SQL 분할이나 이력 테이블 스키마를 몰라도 쓸 수 있어야 한다.

```ts
listPending(client, dir): Promise<string[]>          // 미적용 마이그레이션 이름 (적용 순서대로)
isFreshDatabase(client): Promise<boolean>            // 테이블이 하나도 없는 새 DB 인가
applyMigrations(client, dir, names): Promise<void>   // 순차 적용 + 이력 기록
snapshotTo(client, destPath): Promise<void>          // VACUUM INTO 백업
```

**오류 신호 방식.** 러너는 `process.exit` 을 호출하지 않는다. 비정상 상태는 판별 가능한 타입의
예외로 던지고, exit code 로 옮기는 책임은 호출자(`PrismaService` 와 `src/migrate-main.ts`)가 진다.
러너를 테스트에서 그대로 쓰기 위한 조건이다.

- `listPending()` 이 던지는 것: `LegacySchemaError`(이력 테이블 없이 테이블만 존재 → exit 4),
  `DowngradeError`(이력에 있는 마이그레이션이 파일에 없음 → exit 5)
- `applyMigrations()` 가 던지는 것: `MigrationFailedError`(실패한 마이그레이션 이름과 문장 번호를 담는다 → exit 1)

**이력 테이블 생성 책임은 `applyMigrations()` 에 있다.** 첫 문장을 실행하기 전에
`CREATE TABLE IF NOT EXISTS "_prisma_migrations"` 를 수행한다. `listPending()` 은 읽기 전용이며,
테이블이 없으면 만들지 않고 "적용된 것이 없음" 으로 판정한다 (신규 DB 인지 레거시 DB 인지는
`isFreshDatabase()` 결과와 조합해 가린다).

`resolveDatabaseUrl()` 추출은 **이 설계의 필수 조건**이다. `sp-migrate.exe` 가 `sp-server.exe` 와
반드시 같은 DB 파일을 열어야 하는데, 현재 그 로직은 `main.ts` 안에만 있다. 두 exe 가 서로 다른
파일을 열면 조용히 어긋난다.

### 삭제되는 것

**`ensureSchema()` 의 하드코딩 DDL 130여 줄을 삭제한다.** 첫 마이그레이션
(`20260430123641_initial`)이 같은 테이블을 만들어 주므로 역할이 겹치고, 이것이 이중 원본의 실체다.

---

## 5. 부팅 순서와 실패 모드

### 부팅 순서 변경

마이그레이션 SQL 은 FK 가 꺼져 있어야 동작하므로, 판정/적용을 `foreign_keys=ON` **앞으로** 당긴다.

```
현재: $connect → WAL → synchronous → foreign_keys=ON → ensureSchema()
변경: $connect → WAL → synchronous → [마이그레이션 판정/적용] → foreign_keys=ON
```

판정은 `PrismaService` 자신(`this`)으로 하지만, **적용은 `createMigrationClient()` 로 만든 단기
client** 로 한다. `applyMigrations()` 는 커넥션이 하나로 고정된 client 를 요구하고(§6), Nest 가 만든
`PrismaService` 의 풀은 그 조건을 만족하지 않는다. 적용이 끝나면 즉시 `$disconnect()` 한다.

한때 "빈 DB 초기화 경로는 지울 데이터가 없으니 `this` 로도 안전하다" 고 두었는데, 그 근거는 현재
마이그레이션 목록에서만 성립한다 — seed 마이그레이션(`20260714121735_seed_initial_autocomplete`)
뒤에 `RedefineTables` 가 하나라도 추가되면 빈 DB 초기화 도중에도 지울 데이터가 존재하게 되고 같은
결함이 조용히 되살아난다. 그래서 근거가 아니라 생성 경로로 막았다.

### 실패 모드

| 상황 | 판정 방법 | 동작 | exit |
|---|---|---|---|
| 테이블 0개 | `sqlite_master` 조회 | 신규 DB. 전체 적용 후 부팅 | 0 |
| 이력 있음 + 미적용분 있음 | 이력 ↔ 파일 목록 비교 | 안내 출력 후 종료 | 3 |
| **테이블 있음 + 이력 테이블 없음** | 위 두 조건 모두 불성립 | **거부.** 구 `ensureSchema()` 가 만든 DB 이며 어디까지 적용됐는지 알 수 없다 | 4 |
| 이력에는 있는데 파일이 없음 | 이력 ⊄ 파일 목록 | 거부. exe 가 DB 보다 구버전(다운그레이드 시도) | 5 |
| **migrations 디렉터리 자체가 없음** | `resolveMigrationsDir()` 이 후보 경로를 모두 못 찾고 예외 | 거부. pkg 내장이 깨진 설치 손상 상태. 안내(`formatNoMigrationFilesNotice`) + 후보 경로 목록을 로그에 남긴다 | 6 |
| **migrations 디렉터리가 비어 있음** | `listMigrationFiles()` 결과 0개 | 같은 진단, 같은 안내 | 6 |
| **테이블 0개 + 적용 완료 이력 있음** | `isFreshDatabase()` && `listApplied().length > 0` | 거부. 손상된 백업 복원/DB 파일 오교체. 미적용분 개수와 무관하게 이 판정이 먼저다 (`formatSchemaMissingNotice`) | 6 |
| 적용 중 SQL 실패 | `$executeRawUnsafe` 예외 | 즉시 중단. 해당 마이그레이션은 이력에 `finished_at` **NULL 인 미완료 행으로 남는다** (기록 자체는 실행 전에 이미 해뒀다 — §6 참고). 백업 복원 안내 | 1 |
| **다른 `sp-server.exe` 실행 중** | `sp-server.lock` 의 PID 가 살아 있음 | 거부. Nest 를 띄우기 전, DB 파일을 열기도 전에 멈춘다 (`formatServerAlreadyRunningNotice`) | 7 |
| **`sp-migrate.exe` 업그레이드 중** | `sp-migrate.lock` 의 PID 가 살아 있음 | 거부. 반쯤 재작성된 스키마 위로 부팅하지 않는다 (`formatMigrateInProgressNotice`) | 7 |

exit code 3 을 일반 오류(1)와 구분하는 이유: nssm 같은 서비스 래퍼나 배치 스크립트가
"재시도해도 소용없는 상태" 를 알아보고 무한 재기동을 피할 수 있다.

**exit 1 은 "신규 DB 초기화 실패" 전용이 아니다.** `README-exe.txt` 는 `sp-server.exe` 의 exit 1 을
"DB 파일과 `-wal`/`-shm` 을 지우고 다시 실행" 으로 안내하는데, 그 지시는 화면에 "데이터베이스
초기화에 실패했습니다" 안내가 실제로 나온 경우에만 유효하다. 그 밖의 예상하지 못한 예외도 Node 의
기본 동작상 exit 1 로 끝나므로 — 그래서 위 표의 exit 6 세 줄이 중요하다. 설치 손상을 exit 1 로
흘려보내면 관리자가 유일한 설명서를 따라 데이터가 들어 있는 DB 를 지우게 된다.

테이블 0개 판정을 "이력에 완료 행이 있는지" 와 함께 묻는 이유(위 표 여덟 번째 줄): 이력만 남고
테이블이 사라진 파일을 "최초 실행" 으로 오인하면 뒤쪽 마이그레이션만 빈 파일에 적용하게 되고,
`INSERT INTO new_x SELECT ... FROM x` 에서 죽는다. 반대로 "이력 테이블 존재 여부" 로 물으면
`ensureMigrationsTable()` 직후 첫 INSERT 전에 죽어 빈 이력 테이블만 남은 진짜 최초 실행을 손상으로
오진한다. 그래서 `listApplied().length > 0` 로 판정한다.

세 번째 항목(이력 테이블 없음)이 특히 중요하다. 조용히 처음부터 재적용하면 `CREATE TABLE` 이 실패하거나
최악의 경우 `RedefineTables` 가 기존 데이터를 날린다.

다섯 번째 항목(다운그레이드)은 폐쇄망에서 현실적인 위험이다. 구버전 exe 가 USB 에 남아 돌아다니다가
최신 DB 에 붙으면, 존재하지 않는 컬럼을 조회하다 런타임에 죽는다. 부팅 시점에 잡는 편이 낫다.

마지막 두 줄(잠금)의 근거와 설계는 §6 의 "트랜잭션을 쓰지 않는 대가" 에 함께 적었다. 잠금 확인은
`NestFactory.create()` **앞**이다. Prisma 가 DB 파일을 열기 전에 판단해야 하고, 부팅 도중(빈 DB 초기화)
구간까지 이 프로세스가 DB 를 쥔 것으로 표시되어야 한다.

`sp-server.exe` 의 exit 7 에는 진단 부수 효과가 하나 더 있다. 예전에는 두 번째 서버가 3000번 포트
바인딩에서 `EADDRINUSE` 로 죽었고, `bootstrap()` 이 `void` 로 호출되므로 그 실패가 처리되지 않은
Promise 거부로 새어나가 **영문 스택 트레이스 + exit 1** 로 끝났다. 위 설명대로 `README-exe.txt` 의
exit 1 은 "DB 파일을 지워야 할 수도 있는 상태" 와 묶여 있어, 포트 충돌이라는 사소한 실수가 최악의
오조작(데이터가 들어 있는 DB 삭제)으로 이어질 수 있었다. 이제 한국어 안내와 exit 7 로 끝난다.

---

## 6. 적용 메커니즘

### 트랜잭션을 쓰지 않는다

Prisma 의 `$transaction` 으로 감싸면 마이그레이션 SQL 안의 `PRAGMA defer_foreign_keys` /
`PRAGMA foreign_keys=OFF` 가 무시되어 오히려 위험해진다. PRAGMA 는 트랜잭션 안에서 동작하지 않는다.

마이그레이션 파일이 스스로 FK 를 관리하도록 두고, **원자성은 트랜잭션이 아니라 사전 백업으로 확보**한다.
`prisma migrate` 엔진도 같은 이유로 SQLite 를 특별 취급한다.

실제 마이그레이션 SQL 이 이 패턴을 쓴다 (`20260501004505_m3_node_progress/migration.sql`):

```sql
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_schedule_nodes" (...);
INSERT INTO "new_schedule_nodes" (...) SELECT ... FROM "schedule_nodes";
DROP TABLE "schedule_nodes";
ALTER TABLE "new_schedule_nodes" RENAME TO "schedule_nodes";
...
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

### 트랜잭션을 쓰지 않는 대가: 서버가 켜져 있으면 데이터가 사라진다

위 결정에는 직접적인 대가가 따른다. 트랜잭션이 없으므로 테이블 재정의는 **문장 하나하나가 그 자리에서
커밋**된다.

```
CREATE TABLE "new_schedule_nodes" (...)                            -- 커밋
INSERT INTO "new_schedule_nodes" SELECT ... FROM "schedule_nodes"  -- 커밋
DROP TABLE "schedule_nodes"                                        -- 커밋
ALTER TABLE "new_schedule_nodes" RENAME TO "schedule_nodes"         -- 커밋
```

`INSERT SELECT` 와 `DROP TABLE` 사이에 살아 있는 서버가 사용자 편집 한 건을 커밋하면, 그 행은 이미
복사가 끝난 새 테이블에 없고 `DROP` 이 원본 테이블째로 지워버린다. WAL 모드는 이걸 막지 않는다 —
읽기와 쓰기의 동시 진행이 WAL 의 목적이고, 스키마 변경은 다른 커넥션에 재준비(re-prepare)를 유발할 뿐이다.

**사전 백업으로도 복구할 수 없다.** 백업은 마이그레이션 시작 전에 뜬 것이라 그 편집은 애초에 백업에
들어 있지 않다. 조용히, 되돌릴 수 없이 사라진다. 이 설계에서 백업이 "원자성을 대신한다" 고 말할 수 있는
전제 자체가 **적용 중에 다른 쓰기가 없다**는 것이다.

정상 흐름에서는 이 상태가 저절로 생기지 않는다. `sp-server.exe` 는 미적용분이 있으면 exit 3 으로
부팅을 거부하므로 "서버 실행 중 + 미적용분 있음" 이 성립하지 않는다. 성립하는 경로는 하나다:
**관리자가 실행 중인 서버를 끄지 않고 exe 파일만 덮어쓰는 것.** 구버전 프로세스는 부팅 시점 기준으로
이미 최신이었으므로 아무 이상 없이 계속 서비스하고, 새 `sp-migrate.exe` 가 그 살아 있는 DB 를 상대로
돌아간다. 눈에 띄는 증상이 없다는 점이 이 경로를 특히 위험하게 만든다.

같은 위험이 반대 방향에도 있다. `sp-migrate.exe` 가 재작성 중인 DB 위로 `sp-server.exe` 가 부팅하면,
사라진 테이블을 조회하거나 곧 `DROP` 될 테이블에 쓴다. 두 개의 `sp-migrate.exe` 가 겹쳐 돌면 한쪽의
`DROP TABLE` 이 다른 쪽이 방금 만든 새 테이블을 지운다. 두 개의 `sp-server.exe` 는 한 DB 를 두 주체가
고치는 상태다. 그래서 계약은 **네 조합 모두 금지(상호 배제)** 다.

| 실행하려는 것 | 이미 살아 있는 것 | 결과 |
|---|---|---|
| `sp-migrate.exe` | `sp-server.exe` | exit 7 — 서버를 종료하고 다시 실행 |
| `sp-migrate.exe` | `sp-migrate.exe` | exit 7 — 끝날 때까지 기다린다 |
| `sp-server.exe` | `sp-server.exe` | exit 7 — 실행 중인 서버를 그대로 쓴다 |
| `sp-server.exe` | `sp-migrate.exe` | exit 7 — 업그레이드가 끝난 뒤 시작한다 |

`README-exe.txt` 의 "1) sp-server.exe 를 종료합니다" 한 줄에 의존하지 않고 **PID 잠금 파일**로
기계적으로 막는다 (`apps/api/src/common/process-lock.ts`, 판정은 `src/prisma/lock-decision.ts` 의
`decideLockAcquisition(role)` — `decideBoot()` / `decideMigrate()` 와 같은 모양이라 두 exe 가 같은 코드로
판단하고 네 조합을 값으로 테스트할 수 있다).

- 역할별로 잠금 파일이 따로 있다: `<DB 폴더>/sp-server.lock`, `<DB 폴더>/sp-migrate.lock`. 하나로 합치면
  "무엇이 잡고 있는지" 를 구분할 수 없어 관리자에게 맞는 안내(종료할 것인지, 기다릴 것인지)를 줄 수 없다.
  잠금 경로는 `resolveDbFilePath()` 에서 파생시킨다 — 두 exe 가 같은 파일을 보는 것이 이 방어선의
  전제이므로, `resolveDatabaseUrl()` 을 공용화한 것과 같은 이유로 경로 계산도 한 곳에 둔다.
- **확인이 반드시 쓰기보다 먼저다.** 순서를 뒤집으면 두 번째 서버가 첫 번째의 PID 를 덮어써 충돌을
  아무도 눈치채지 못하고, 두 번째가 종료하며 잠금을 지우는 순간 첫 번째가 살아 있는데도 잠금이 사라진다.
- **해제는 자기 PID 가 적혀 있을 때만 한다**(`removeLock()`). 무조건 지우면 위 시나리오의 마지막 단계가
  그대로 성립해 — 서버 A 는 서비스 중인데 잠금은 없는 상태 — 이 잠금이 막으려던 데이터 소실이 일어난다.
- `sp-migrate.exe` 는 **백업보다 먼저** 확인하고, 통과하면 그 자리에서 자기 잠금을 잡고 쓰기 구간에
  들어간다. 순서가 중요하다 — 안내가 "DB 를 전혀 변경하지 않았습니다" 라고 약속하기 때문이다.
  판정(`decideMigrate()`)보다는 뒤에 둔다: 적용할 것이 없는 상태에서 서버가 켜져 있는 것은 정상이고,
  그때는 "이미 최신입니다" 로 끝나야 한다. 해제는 성공·실패·예외를 모두 지나는 `finally` 에서 한다.
- 확인과 쓰기가 원자적이지 않은 점(TOCTOU)은 알고 남겼다. 두 실행 파일은 관리자가 손으로 실행하는
  도구라 경쟁 구간이 사람의 조작 속도 단위이고, `O_EXCL` 로 만들어도 낡은 잠금을 정리하려면 결국
  "확인 후 삭제" 가 필요해 같은 창이 남는다. 막으려는 것은 악의적 경쟁이 아니라 운영 실수다.
- **존재가 아니라 생존으로 판단한다.** `process.kill(pid, 0)` 을 쓰고, `ESRCH` 는 죽음(진행),
  `EPERM` 은 "있지만 우리 권한으로 시그널을 못 보냄" 이므로 살아 있음으로 본다. 강제 종료로 남은 낡은
  잠금이 정상 업그레이드를 영구히 막으면 안 된다.
- **잠금 정리는 최선 노력이다.** `main.ts` 에는 원래 `SIGINT`/`SIGTERM` 핸들러가 없었고, SIGINT
  리스너가 하나도 없는 Node 프로세스는 인터럽트로 죽을 때 `process.on('exit')` 을 실행하지 않는다
  (실험으로 확인). README 가 안내하는 종료 방법이 Ctrl+C 이므로 `'exit'` 만 걸면 거의 매번 낡은 잠금이
  남는다. 그래서 두 시그널 핸들러를 명시적으로 등록한다. 그래도 작업 관리자 강제 종료나 콘솔 창 닫기는
  어느 핸들러도 타지 않는다.
- **PID 재사용은 실재하는 거짓 양성이다.** 윈도우가 그 PID 를 다른 프로그램에 재배정하면 생존 판정이
  참이 되어 관리자가 갇힌다. 그래서 안내 문구가 **그 경우에 해당하는** 잠금 파일의 전체 경로를 싣고
  "종료한 것이 확실하면 이 파일을 지우고 다시 실행하라" 고 알려준다 (서버 잠금과 마이그레이션 잠금은
  다른 파일이므로, 엉뚱한 파일을 지목하면 탈출구가 아니다). **이 탈출구가 없으면 이 안전장치가
  정상적인 업그레이드와 서버 시작을 브릭(brick)시킨다** — 폐쇄망에는 원격으로 손봐줄 사람이 없다.
  잠금을 "단순화" 하려는 다음 사람은 이 문단을 먼저 읽어야 한다: 존재 검사만으로 바꾸거나, 시그널
  핸들러를 지우거나, 소유권 확인 없이 해제하거나, 경로 안내를 빼는 네 가지 변경은 각각 현장에서
  업그레이드나 서버 시작을 막는다(또는 막아야 할 것을 통과시킨다).
- 업그레이드 중 안내(`formatMigrateInProgressNotice`)는 "진행 중인 `sp-migrate.exe` 를 강제 종료하거나
  창을 닫지 말라" 고 못박는다. 그 조작이 바로 위 문장 단위 커밋 사이를 끊어 절반짜리 스키마를 만든다.

### SQL 문장 분할

`$executeRawUnsafe` 는 한 번에 한 문장만 허용하므로 파일을 문장 단위로 쪼개야 한다.
세미콜론 단순 분리로는 부족하다. 다음을 처리한다.

- **단일 인용부호 상태 추적** (`''` 이스케이프 포함) — 문자열 안의 세미콜론에서 잘리지 않도록
- **`--` 라인 주석 무시**
- 여러 줄에 걸친 단일 문장 (예: `20260714121735_seed_initial_autocomplete` 의 30행 INSERT)

현재 마이그레이션에는 문자열 안 세미콜론이 없지만, 일정 제목 같은 데이터를 넣는 seed 마이그레이션이
앞으로 생기면 바로 깨진다.

### 이력 테이블

Prisma 규약을 그대로 쓴다. 아래는 현재 dev DB 에서 추출한 실제 정의다.

```sql
CREATE TABLE "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)
```

`checksum` 은 Prisma 와 같은 방식(`migration.sql` 내용의 SHA-256)으로 채운다. 그래야 나중에 정식
`prisma migrate` 도구로 돌아갈 여지가 남는다.

### 이력 기록 순서: 적용 "전"에 남기고, 성공 시 완료 처리한다

(2026-07-31 결정 변경 — 프로젝트 담당자 승인. 최초 계획은 "적용 후 기록"이었다. 아래에 이유를 남긴다.)

각 마이그레이션마다 SQL 문장을 실행하기 **앞서** `finished_at = NULL` 인 행을 먼저 INSERT 하고
(`started_at`, `applied_steps_count=0`), 문장이 전부 성공하면 그 행을 `finished_at = CURRENT_TIMESTAMP`
로 UPDATE 한다. Prisma 자신이 쓰는 방식과 같다. `listApplied()` 는 `finished_at IS NOT NULL` 인
행만 세므로, 중단된 행이 있어도 "적용됨" 으로 잘못 세지 않는다.

**"적용 후 기록"을 버린 이유.** 원래 계획대로 SQL 을 다 실행한 뒤에야 이력을 기록하면, SQL 자체는
전부 성공했는데 그 마지막 기록 단계(INSERT 한 번)만 실패하는 경우 이력에는 아무 흔적도 남지 않는다.
그러면 다음 실행에서 그 마이그레이션을 미적용으로 보고 **처음부터 다시 실행**하게 되는데, 이미 적용된
`RedefineTables` 패턴(`DROP TABLE` 포함)을 다시 돌리면 데이터를 파괴할 수 있다. "적용 전 기록, 성공 시
완료 처리" 방식에서는 이 경우에도 최소한 `finished_at IS NULL` 인 미완료 행이 남아, 사람이 보면
"이 마이그레이션은 시도된 적이 있다" 는 사실만은 알 수 있다.

**이 방식이 만드는 새로운 위험(가장 날카로운 지점).** 반대로, SQL 실행이 전부 성공한 **직후** 완료
처리(UPDATE)만 실패하면 DB 는 이미 마이그레이션이 적용된 상태인데 이력은 "미완료"로 남는다. 다음
실행은 이 마이그레이션을 다시 미적용으로 보고 **SQL 을 처음부터 재실행**한다 — `CREATE TABLE` 충돌이나
`RedefineTables` 의 데이터 유실로 이어질 수 있다. 두 실패 순서 중 어느 쪽을 택해도 "기록 실패가 재실행을
유발"하는 위험 자체는 없앨 수 없고, 다만 어느 실패가 더 그럴듯한지가 다르다 — SQL 실행(여러 문장, DDL
포함)이 이력 테이블에 대한 단순 INSERT/UPDATE 한 번보다 실패할 가능성이 훨씬 높으므로, "적용 전 기록"이
전체 위험을 줄인다. 이 잔여 위험이 실제로 발생했을 때의 유일한 복구 수단은 §7 의 사전 백업이다.
`README-exe.txt` 의 "업그레이드 관련 주의 사항"에도 이 두 가지를 적어 두었다.

---

## 7. `sp-migrate.exe` 동작

```
1. DB 경로 확인 (resolveDatabaseUrl() — sp-server.exe 와 동일)
2. pending 없음  → "이미 최신입니다" 출력, exit 0
3. 잠금 확인     → sp-server.exe 나 다른 sp-migrate.exe 가 살아 있으면 안내 + exit 7
                   (DB 를 열기만 하고 물러난다)
4. 잠금 획득     → sp-migrate.lock 에 자기 PID 기록 (아래 5~7 구간 = 쓰기 구간)
5. 백업          → backups/pre-migrate/sam_YYYYMMDD_HHMMSS.db  (VACUUM INTO)
6. 순차 적용     → 마이그레이션 이름을 하나씩 출력
7. 성공          → 요약 + "이제 sp-server.exe 를 실행하십시오", exit 0
8. 실패          → 실패 지점 + 백업 파일 경로로 복원 안내, exit 1
9. 종료 시       → 자기 PID 가 적힌 sp-migrate.lock 해제 (finally — 예외 경로까지 포함)
```

### `sp-migrate.exe` 종료 코드

`README-exe.txt` 의 [종료 코드 안내] 와 **같은 내용이어야 한다.** 현장 관리자가 읽는 문서가
`README-exe.txt` 이므로, 계약이 어긋나면 그쪽이 맞고 이 표가 틀린 것이다.

| exit | 상황 | 화면 안내 | DB 상태 |
|---|---|---|---|
| 0 | 이미 최신, 또는 업그레이드 성공 | "이미 최신입니다" / "업그레이드 완료 — N건 적용" | 정상 |
| 1 | 업그레이드 **전 백업** 실패 (폴더 생성 / `VACUUM INTO`) | `formatBackupFailedNotice` | **전혀 변경되지 않음.** 적용을 시작하지도 않았다 |
| 1 | 적용 **도중** 실패 (SQL 실패, 이력 기록 실패, `migration.sql` 읽기 실패 등 예외 전부) | `formatMigrateFailureNotice` | 중간 상태 가능. 백업 경로 + 지울 파일 3개 + 이번에 성공한 목록을 출력 |
| 2 | 진짜 빈 DB (테이블도 이력도 없음) | `formatEmptyDatabaseNotice` | 변경 없음. 최초 초기화는 `sp-server.exe` 의 몫 |
| 4 | 레거시 DB (테이블 있음 + 이력 테이블 없음) | `formatLegacySchemaNotice` | 변경 없음 |
| 5 | 다운그레이드 (이력 ⊄ 파일 목록) | `formatDowngradeNotice` | 변경 없음 |
| 6 | 설치 손상 (migrations 디렉터리 없음/비어 있음), 또는 테이블 0개 + 적용 이력 있음 | `formatNoMigrationFilesNotice` / `formatSchemaMissingNotice` | 변경 없음 |
| 7 | `sp-server.exe` 실행 중, 또는 다른 `sp-migrate.exe` 실행 중 (해당 잠금 파일의 PID 가 살아 있음) | `formatServerRunningNotice` / `formatMigrateInProgressNotice` | **전혀 변경되지 않음.** 백업조차 만들지 않는다 (§6 참고). 안내에 해당 잠금 파일 경로와 "지우고 재실행" 탈출구를 함께 싣는다 |

exit 1 이 두 줄인 것이 이 표의 요점이다. 관리자가 "DB 를 건드렸나?" 를 종료 코드만으로는 구분할
수 없고 **화면 안내 제목으로 구분해야 한다.** 그래서 `runMigrate()` 의 적용 루프 catch 는
`MigrationFailedError` 뿐 아니라 **어떤 예외든** `formatMigrateFailureNotice` 로 수렴시킨다 —
그러지 않으면 백업이 이미 만들어졌는데 관리자에게는 원문 스택만 보이고, 복구에 필요한 백업 경로가
화면에서 사라진다. `runMigrate()` 자체는 `process.exit` 을 부르지 않고 exit code 를 돌려주므로
테스트에서 이 표 전체를 값으로 확인할 수 있다.

모든 출력은 콘솔과 `logs/sp-YYYY-MM-DD.log` 양쪽에 남는다(`appendPlainLog()`). 관리자가 탐색기에서
더블클릭해 실행하면 종료와 함께 창이 사라지는데, 그때 백업 경로를 잃으면 복구 수단 자체를 잃는다 —
`sp-backup.exe list` 는 `backups/pre-migrate/` 를 훑지 않기 때문이다.

백업 방식은 `BackupService` 와 같은 `VACUUM INTO` 를 쓴다 (`backup.service.ts:109`). WAL 모드에서
아직 병합되지 않은 내용까지 포함한 일관된 단일 파일을 만들어 주므로 파일 복사보다 안전하다.

`BackupService` 를 직접 재사용하지 않고 `MigrationRunner.snapshotTo()` 를 따로 두는 이유:
`BackupService` 는 `PrismaService` 에 의존하는 Nest 프로바이더인데, 마이그레이션은 `PrismaService`
초기화 도중에 일어난다. 재사용하면 순환 의존이 생긴다.

백업을 **별도 `pre-migrate/` 폴더**에 두는 이유는 일상 자동 백업(`BackupService`, 기본 보존
`BACKUP_RETENTION_DAYS`=30일)의 정리 대상에 섞여 지워지지 않게 하기 위해서다. 업그레이드 직전
스냅샷은 문제가 뒤늦게 발견될 수 있어 더 오래 남아야 한다.

실제로 섞이지 않는 이유는 두 겹이고, **지금 실제로 지켜 주는 쪽은 첫 번째다.**

1. **애초에 다른 트리다.** `BackupService.backupDir` 의 기본값은 `<cwd>/data/backup`
   (`backup.service.ts:44-48`)이고, `sp-migrate.exe` 의 스냅샷은 `<cwd>/backups/pre-migrate` 다.
   `cleanupOld()` 는 자기 `backupDir` 아래만 훑으므로 이 경로는 스캔 대상에 들어오지도 않는다.
2. **이름 패턴도 걸리지 않는다.** `cleanupOld()` 는 하위 항목 중 이름이 8자리 숫자(`YYYYMMDD`)인
   것만 정리 대상으로 보는데 `pre-migrate` 는 그 패턴이 아니다. 이 두 번째 방어선은 누군가
   `BACKUP_DIR=./backups` 로 설정해 두 트리가 겹쳤을 때에만 의미가 있다.

---

## 8. `build-exe.js` 변경

| 단계 | 변경 |
|---|---|
| 3/5 | 변경 없음 — `migrate-main.ts` 는 `apps/api/src/` 에 있어 기존 `pnpm -F @sam/api build`(nest build)가 그대로 `dist/migrate-main.js` 를 만든다. `scripts/backup-cli.ts` / `scripts/reset-admin-cli.ts` 를 위한 별도 `tsc` 호출(3/5)에는 손대지 않는다 — 4번째 대상으로 끼워 넣으면 §4 에 적은 `rootDir` 추론 위험(예상, 미확인)이 현실화될 수 있다 |
| 4/5 | `dist-bundle/migrate/` ncc 번들 추가. `server/` 와 `migrate/` 양쪽에 `prisma/migrations/` 복사 |
| pkg assets | `server` / `migrate` 의 `package.json` 에 `'migrations/**/*'` 추가 (기존 `public/**/*` 옆에) |
| 5/5 | `sp-migrate.exe` 생성 추가 |
| 문서 | `README-exe.txt` 에 업그레이드 절차 항목 신설 |

`sp-server.exe` 도 마이그레이션 파일을 내장해야 한다. **판정에 파일 목록이 필요**하기 때문이다
(SQL 내용은 쓰지 않지만 이름 비교용).

---

## 9. 테스트 전략

`apps/api` 에는 현재 테스트 러너가 없다. shared/web 과 같은 **vitest 2.1.8** 을 devDependency 로
추가한다 (모노레포에 이미 있는 버전이라 pnpm store 재사용).

| 종류 | 대상 |
|---|---|
| 단위 | `splitSqlStatements` — 문자열 내 세미콜론, `''` 이스케이프, `--` 주석, 여러 줄 INSERT |
| 단위 | `checksumOf()` 가 실제 마이그레이션 6개에 대해 dev DB 의 `_prisma_migrations.checksum` (정식 prisma CLI 가 기록한 값)과 일치. 그 값을 테스트에 그대로 고정해 두었다 — 정식 도구로 돌아갈 여지를 지키는 동시에, 줄바꿈이 CRLF 로 오염되면(`.gitattributes` 의 `text eol=lf` 가 무너지면) 빨간불이 난다 |
| 단위 | `migration-messages.ts` 의 안내 문구 — 관리자가 읽고 행동하는 텍스트이므로 문구 자체를 고정한다 (백업 경로, 지울 파일 3개, 문장 번호를 특정할 수 없는 경우 등) |
| 단위 | `createMigrationClient()` / `withSingleConnection()` — 결과 URL 에 항상 `connection_limit=1` 이 들어간다 |
| 통합 | 임시 SQLite 파일에 전체 적용 → pending 0, 테이블·인덱스 존재 확인 |
| 통합 | 일부만 적용된 DB + 신규 마이그레이션 → pending 산출 정확성 |
| 통합 | 데이터가 들어 있는 DB 에 `RedefineTables` 마이그레이션 적용 → 행 보존 |
| 통합 | `decideBoot()` / `decideMigrate()` 의 여덟 가지 상태 — 두 파일에 **같은 상태의 테스트를 짝으로** 둔다 |
| 통합 | 레거시 DB(테이블 있음 + 이력 없음) → 거부, exit 4 |
| 통합 | 다운그레이드(이력 > 파일) → 거부, exit 5 |
| 통합 | `runMigrate()` 정상 경로 — 데이터가 있는 DB 에 실제 마이그레이션 적용, exit 0. **백업 스냅샷에 이번 마이그레이션이 없다**는 것까지 확인해 "백업이 적용보다 먼저" 를 고정한다 (트랜잭션을 쓰지 않는 이 설계에서 원자성을 대신하는 것이 그 순서다) |
| 통합 | `runMigrate()` 백업 실패 경로 — exit 1 + `formatBackupFailedNotice`, `process.env.DATABASE_URL` 오염 없음 |
| 단위 | `process-lock.ts` — 역할별 잠금 경로 파생(상대경로/쿼리스트링 정규화, 두 역할이 다른 파일), 쓰기·읽기·삭제 왕복, 깨진 내용은 "잠금 없음", 죽은 PID 는 막지 않음, **남의 PID 가 적힌 잠금은 지우지 않음** |
| 단위 | `decideLockAcquisition()` — 네 조합 모두 exit 7 이고, 안내가 각 경우에 맞는 잠금 파일 경로와 다시 실행할 실행 파일을 지목한다. 두 잠금이 모두 살아 있으면 서버 쪽을 먼저 알린다 |
| 통합 | `runMigrate()` 잠금 경로 — 살아 있는 PID(테스트 프로세스 자신)로 서버/마이그레이션 잠금을 만들면 각각 exit 7 이고 **`backups/` 폴더가 생기지도 않는다**. 검사가 백업보다 먼저라는 순서를 이 단언으로 고정한다. 낡은 잠금(죽은 PID)은 막지 않고, 성공·실패 경로 모두에서 자기 잠금을 놓는다는 짝 테스트도 둔다 |

통합 테스트는 실제 SQLite 파일을 임시 디렉터리에 만들어 돌린다. 마이그레이션 SQL 이 진짜 실행되는지가
이 설계의 유일한 위험 지점이므로, 여기는 목(mock)으로 대체하지 않는다.

`vitest.config.ts` 는 `fileParallelism: false` 다 (실제 파일을 다루는 통합 테스트가 있어서다).
그래서 `process.chdir()` 을 쓰는 테스트는 `afterEach` 에서 **임시 디렉터리를 지우기 전에** cwd 를
되돌려야 한다 — 새면 뒤에 실행되는 모든 테스트 파일이 깨진다.

### 아직 테스트로 덮이지 않은 것

- **단일 커넥션(`connection_limit=1`) 불변식의 실제 효과.** 값(URL 문자열)은 고정했지만, 커넥션이
  둘 이상일 때 `PRAGMA foreign_keys=OFF` 가 무력화되어 CASCADE 로 자식 행이 지워지는 현상 자체는
  재현하지 못했다 (`migration-runner.test.ts` 의 데이터 보존 테스트 주석 참고 — `connection_limit=1`
  을 지워도 그 테스트는 통과한다). 동시 쿼리를 강제하는 별도 테스트가 필요하다.
- **`PrismaService` 의 부팅 판정 경로.** Nest 컨텍스트와 `process.exit` 이 얽혀 있어 판정 로직만
  `decideBoot()` 으로 떼어내 테스트했다. exit code 로 옮기는 얇은 층은 검증되지 않는다.

---

## 10. 결정 로그

| 결정 | 선택 | 근거 |
|---|---|---|
| 마이그레이션 적용 방식 | SQL 파일 내장 + 자체 러너 | prisma CLI 동봉은 단일 exe 목표와 충돌. `PRAGMA user_version` 방식은 DDL 이중 원본을 심화 |
| 적용 주체 | `sp-migrate.exe` 로 분리 | `sp-server.exe` 가 쓰기 작업을 전혀 하지 않는 경로를 갖게 되어, "안내만 하고 종료" 가 안전하다고 말할 근거가 생긴다 |
| 최초 실행 | `sp-server.exe` 가 직접 적용 | 잃을 데이터가 없는 유일한 상태. 기존 1단계 UX 유지 |
| 업그레이드 시 exit code | 3 (전용) | 서비스 래퍼가 무한 재기동을 피할 수 있다 |
| `ensureSchema()` DDL | 삭제, `prisma/migrations` 로 단일화 | 이중 원본 제거가 이 작업의 실익 |
| 트랜잭션 | 사용하지 않음 | PRAGMA 가 트랜잭션 안에서 무시됨. 원자성은 사전 백업으로 확보 |
| 동시 실행 방지 | 역할별 PID 잠금 파일 2개 + 생존 확인 + 소유권 기반 해제, 네 조합 모두 exit 7 | 트랜잭션을 쓰지 않는 대가로, 적용 중 다른 프로세스가 커밋한 편집은 사전 백업에도 없어 복구가 불가능하다(§6). 문서 한 줄("서버를 종료하십시오")로 막을 위험이 아니다. 존재가 아니라 생존으로 판단하고, PID 재사용 거짓 양성을 위해 "그 잠금 파일을 지우고 재실행" 탈출구를 안내에 싣는다 |
| 동시 실행 exit code | 네 경우 모두 7 (8/9 를 새로 만들지 않음) | 뜻이 하나다 — "다른 프로세스가 DB 를 쓰고 있어 시작하지 않았다". 무엇이 잡고 있고 무엇을 해야 하는지는 화면 안내로 구분한다. `README-exe.txt` 의 종료 코드 표를 짧게 유지하는 쪽이 현장에서 읽힌다 (exit 1 이 두 안내를 공유하는 것과 같은 방식) |
| 레거시 DB baseline | 지원하지 않고 거부 | 현장 배포 이력이 없음을 확인. 잘못된 추정으로 데이터를 날리는 위험이 더 크다 |
| 백업 위치 | `backups/pre-migrate/` | 일상 자동 백업의 보존 기간 정리(`cleanupOld()`)에서 제외된다. 결정적인 이유는 `BackupService.backupDir` 기본값이 `<cwd>/data/backup` 이라 **트리 자체가 다르다**는 것이고, 폴더명 8자리 숫자 패턴에 걸리지 않는다는 점은 `BACKUP_DIR=./backups` 로 두 트리를 겹쳤을 때만 작동하는 두 번째 방어선이다 (§7 참고) |
| 이력 기록 시점 | 적용 "전"에 미완료 행 INSERT, 성공 시 UPDATE | 최초 계획(적용 후 기록)은 SQL 전부 성공 + 기록 실패 시 이력에 아무 흔적이 안 남아 다음 실행이 이미 적용된 파괴적 SQL 을 재실행함. Prisma 자신의 방식과 동일하게 맞춰 이 위험을 줄임 (담당자 승인, 2026-07-31). 남은 잔여 위험(성공 직후 완료 처리만 실패)은 §6 참고, 복구는 사전 백업 |

---

## 11. 확인된 사실 (조사 기록)

- 마이그레이션 6개 존재. 로컬 dev DB 에는 `_prisma_migrations` 테이블 있음.
- `schema-engine-windows.exe` 는 `node_modules` 에 있으나 `build-exe.js` 필터에 걸리지 않아 미복사.
- `build-exe.js` 는 `prisma generate` 를 스스로 돌리지 않고 `node_modules` 의 생성물에 의존한다
  (`apps/api` 의 `postinstall` 이 이를 보장한다).
- exe 내장 자원 접근은 `app.module.ts:26-30` 의 "후보 경로 목록 중 존재하는 첫 항목" 패턴을 쓴다.
- 현재 마이그레이션 SQL 중 문자열 리터럴에 세미콜론을 포함한 것은 없다.
- 현장(폐쇄망)에 배포된 exe 및 실제 데이터 DB 는 아직 없다.
- **SIGINT 리스너가 없는 Node 프로세스는 인터럽트로 죽을 때 `process.on('exit')` 핸들러를 실행하지
  않는다** (실험으로 확인). `main.ts` 에는 원래 `SIGINT`/`SIGTERM` 핸들러가 없었고, README 가 안내하는
  종료 방법이 Ctrl+C 이므로 잠금 정리를 `'exit'` 에만 걸면 거의 매번 낡은 잠금이 남는다.
- **Prisma Client 는 `.env` 파일을 읽지 않는다.** `.env` 를 읽는 것은 Prisma CLI(`prisma migrate dev`
  등) 뿐이다. 이 차이 때문에 `resolveDatabaseUrl()`(`apps/api/src/common/db-path.ts`)이 `.env` 를
  직접 파싱하는 분기를 스스로 두고 있다 — 이 분기가 없으면 로컬 개발에서 실행 중인 앱과
  `prisma migrate dev` 가 서로 다른 DB 파일을 열게 된다 (하나는 `process.env.DATABASE_URL` 미설정 시
  폴백 경로를, 다른 하나는 `.env` 의 `DATABASE_URL` 을 보게 되므로).
