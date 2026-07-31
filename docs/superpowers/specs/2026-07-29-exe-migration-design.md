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
| `MigrationRunner` | `apps/api/src/prisma/migration-runner.ts` (신규) | 이력 읽기, 미적용 목록 산출, SQL 문장 분할, 순차 적용 | `PrismaClient` 인스턴스 + 디렉터리 경로. **Nest 의존 없음** |
| `resolveMigrationsDir()` | `apps/api/src/prisma/migration-runner.ts` | exe/로컬 양쪽에서 `migrations/` 위치 탐색 | `app.module.ts:26-30` 의 후보 경로 패턴 재사용 |
| `resolveDatabaseUrl()` | `apps/api/src/common/db-path.ts` (신규, `main.ts:13-20` 에서 추출) | DB 파일 경로 결정 | — |
| `PrismaService` | `apps/api/src/prisma/prisma.service.ts` (수정) | 부팅 시 판정. 빈 DB 면 직접 적용, 기존 DB 면 안내 후 종료 | `MigrationRunner` |
| `migrate-main.ts` | `apps/api/src/migrate-main.ts` (신규) → `sp-migrate.exe` | 백업 → 적용 → 결과 리포트 | `MigrationRunner` |
| `build-exe.js` | (수정) | `migrations/**` 를 pkg asset 으로 내장, `sp-migrate.exe` 번들 추가 | — |

`migrate-main.ts` 를 계획 당시 생각했던 `apps/api/scripts/` 가 아니라 `apps/api/src/` 에 둔 이유:
`build-exe.js` 는 `scripts/backup-cli.ts` 와 `scripts/reset-admin-cli.ts` 를 `npx tsc scripts/...`
형태로 **별도 `tsc` 호출**로 컴파일한다. 이 항목을 `scripts/` 에 두고 `../src/` 를 import 하면
tsc 가 두 디렉터리를 모두 아우르도록 `rootDir` 를 추론해버려 출력 경로 구조가 바뀌고, 그 결과
ncc 가 기대하는 엔트리 경로(`dist/scripts/migrate-cli.js`)가 어긋난다. 반면 `src/migrate-main.ts` 는
`nest build` 가 만드는 `dist/migrate-main.js` 를 그대로 ncc 에 넘기면 되므로(§8 참고) 이 문제가 없다.

### `MigrationRunner` 인터페이스

내부의 SQL 분할이나 이력 테이블 스키마를 몰라도 쓸 수 있어야 한다.

```ts
listPending(client, dir): Promise<string[]>          // 미적용 마이그레이션 이름 (적용 순서대로)
isFreshDatabase(client): Promise<boolean>            // 테이블이 하나도 없는 새 DB 인가
applyMigrations(client, dir, names): Promise<void>   // 순차 적용 + 이력 기록
snapshotTo(client, destPath): Promise<void>          // VACUUM INTO 백업
```

**오류 신호 방식.** 러너는 `process.exit` 을 호출하지 않는다. 비정상 상태는 판별 가능한 타입의
예외로 던지고, exit code 로 옮기는 책임은 호출자(`PrismaService` 와 `migrate-cli.ts`)가 진다.
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

### 실패 모드

| 상황 | 판정 방법 | 동작 | exit |
|---|---|---|---|
| 테이블 0개 | `sqlite_master` 조회 | 신규 DB. 전체 적용 후 부팅 | 0 |
| 이력 있음 + 미적용분 있음 | 이력 ↔ 파일 목록 비교 | 안내 출력 후 종료 | 3 |
| **테이블 있음 + 이력 테이블 없음** | 위 두 조건 모두 불성립 | **거부.** 구 `ensureSchema()` 가 만든 DB 이며 어디까지 적용됐는지 알 수 없다 | 4 |
| 이력에는 있는데 파일이 없음 | 이력 ⊄ 파일 목록 | 거부. exe 가 DB 보다 구버전(다운그레이드 시도) | 5 |
| 적용 중 SQL 실패 | `$executeRawUnsafe` 예외 | 즉시 중단. 해당 마이그레이션은 이력에 `finished_at` **NULL 인 미완료 행으로 남는다** (기록 자체는 실행 전에 이미 해뒀다 — §6 참고). 백업 복원 안내 | 1 |

exit code 3 을 일반 오류(1)와 구분하는 이유: nssm 같은 서비스 래퍼나 배치 스크립트가
"재시도해도 소용없는 상태" 를 알아보고 무한 재기동을 피할 수 있다.

세 번째 항목(이력 테이블 없음)이 특히 중요하다. 조용히 처음부터 재적용하면 `CREATE TABLE` 이 실패하거나
최악의 경우 `RedefineTables` 가 기존 데이터를 날린다.

다섯 번째 항목(다운그레이드)은 폐쇄망에서 현실적인 위험이다. 구버전 exe 가 USB 에 남아 돌아다니다가
최신 DB 에 붙으면, 존재하지 않는 컬럼을 조회하다 런타임에 죽는다. 부팅 시점에 잡는 편이 낫다.

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
3. 백업          → backups/pre-migrate/sam_YYYYMMDD_HHMMSS.db  (VACUUM INTO)
4. 순차 적용     → 마이그레이션 이름을 하나씩 출력
5. 성공          → 요약 + "이제 sp-server.exe 를 실행하십시오", exit 0
6. 실패          → 실패 지점 + 백업 파일 경로로 복원 안내, exit 1
```

백업 방식은 `BackupService` 와 같은 `VACUUM INTO` 를 쓴다 (`backup.service.ts:109`). WAL 모드에서
아직 병합되지 않은 내용까지 포함한 일관된 단일 파일을 만들어 주므로 파일 복사보다 안전하다.

`BackupService` 를 직접 재사용하지 않고 `MigrationRunner.snapshotTo()` 를 따로 두는 이유:
`BackupService` 는 `PrismaService` 에 의존하는 Nest 프로바이더인데, 마이그레이션은 `PrismaService`
초기화 도중에 일어난다. 재사용하면 순환 의존이 생긴다.

백업을 **별도 `pre-migrate/` 폴더**에 두는 이유는 일상 자동 백업(`BackupService`, 기본 보존
`BACKUP_RETENTION_DAYS`=30일)의 정리 대상에 섞여 지워지지 않게 하기 위해서다. 실제로도 섞일 수
없다 — `BackupService.cleanupOld()`(`backup.service.ts`)는 백업 디렉터리 하위 항목 중 이름이
8자리 숫자(`YYYYMMDD`)인 것만 정리 대상으로 보는데, `pre-migrate` 는 이 패턴에 맞지 않아 애초에
스캔 대상에 잡히지 않는다. 업그레이드 직전 스냅샷은 문제가 뒤늦게 발견될 수 있어 더 오래 남아야 한다.

---

## 8. `build-exe.js` 변경

| 단계 | 변경 |
|---|---|
| 3/5 | 변경 없음 — `migrate-main.ts` 는 `apps/api/src/` 에 있어 기존 `pnpm -F @sam/api build`(nest build)가
그대로 `dist/migrate-main.js` 를 만든다. `scripts/backup-cli.ts` / `scripts/reset-admin-cli.ts` 를 위한
별도 `tsc` 호출(3/5)에는 손대지 않는다 — 4번째 대상으로 끼워 넣으면 §4 각주에 적은 `rootDir` 추론 문제가
생긴다 |
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
| 단위 | `checksum` 이 Prisma 값과 일치 (기존 dev DB 이력과 대조) |
| 통합 | 임시 SQLite 파일에 전체 적용 → pending 0, 테이블·인덱스 존재 확인 |
| 통합 | 일부만 적용된 DB + 신규 마이그레이션 → pending 산출 정확성 |
| 통합 | 레거시 DB(테이블 있음 + 이력 없음) → 거부, exit 4 |
| 통합 | 다운그레이드(이력 > 파일) → 거부, exit 5 |

통합 테스트는 실제 SQLite 파일을 임시 디렉터리에 만들어 돌린다. 마이그레이션 SQL 이 진짜 실행되는지가
이 설계의 유일한 위험 지점이므로, 여기는 목(mock)으로 대체하지 않는다.

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
| 레거시 DB baseline | 지원하지 않고 거부 | 현장 배포 이력이 없음을 확인. 잘못된 추정으로 데이터를 날리는 위험이 더 크다 |
| 백업 위치 | `backups/pre-migrate/` | 일상 자동 백업의 보존 기간 정리(`cleanupOld()`, 폴더명 8자리 숫자 패턴만 정리)에서 자연히 제외됨 |
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
- **Prisma Client 는 `.env` 파일을 읽지 않는다.** `.env` 를 읽는 것은 Prisma CLI(`prisma migrate dev`
  등) 뿐이다. 이 차이 때문에 `resolveDatabaseUrl()`(`apps/api/src/common/db-path.ts`)이 `.env` 를
  직접 파싱하는 분기를 스스로 두고 있다 — 이 분기가 없으면 로컬 개발에서 실행 중인 앱과
  `prisma migrate dev` 가 서로 다른 DB 파일을 열게 된다 (하나는 `process.env.DATABASE_URL` 미설정 시
  폴백 경로를, 다른 하나는 `.env` 의 `DATABASE_URL` 을 보게 되므로).
