# exe 배포판 DB 마이그레이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `prisma/migrations/` 를 단일 원본으로 삼아, exe 배포판이 기존 DB 를 안전하게 업그레이드할 수 있게 한다.

**Architecture:** NestJS 와 무관한 순수 모듈 `MigrationRunner` 를 만들어 판정/적용 로직을 담는다. `sp-server.exe` 는 부팅 시 판정만 하고 미적용분이 있으면 한글 안내 후 exit 3 으로 종료한다. 실제 적용은 신규 `sp-migrate.exe` 가 사전 백업 후 수행한다. DB 가 아예 없는 최초 실행만 예외로 `sp-server.exe` 가 직접 적용한다.

**Tech Stack:** TypeScript 5.6.3, NestJS 10, Prisma 5.22 (SQLite), vitest 2.1.8, @vercel/ncc, @yao-pkg/pkg

**설계 문서:** `docs/superpowers/specs/2026-07-29-exe-migration-design.md`

## Global Constraints

- Node.js `>=20.10.0`, pnpm 11.x (루트 `package.json` 의 `packageManager` 가 버전을 결정)
- **`cd` 를 독립 실행하지 말 것.** 모든 명령은 저장소 루트에서 `pnpm -F <pkg> ...` 형태로 실행한다
- 코드 수정 후 반드시 `pnpm -r typecheck` 로 컴파일 에러를 확인한다
- **기존 인라인 주석·설계 마일스톤 설명·docstring 을 임의로 삭제하지 않는다.** 기능 변경과 직접 관계된 경우만 손댄다
- 검증은 `class-validator` / `ValidationPipe` 를 쓰지 않는다. Zod + `ZodValidationPipe` 만 사용 (이 계획에는 신규 API 가 없어 해당 없음)
- `exactOptionalPropertyTypes: true` 이므로 optional 필드에 `undefined` 를 직접 넣지 않는다
- SQLite 는 `enum` 미지원. 결과 행을 반환하는 `PRAGMA` 는 `$queryRawUnsafe` 를, 반환하지 않는 것은 `$executeRawUnsafe` 를 쓴다
- **DB 스키마·마이그레이션 변경이 발생하면 작업 후 사용자에게 상세히 공유한다** (AGENTS.md 7)
- 한글 메시지는 번역투를 쓰지 않는다. 터미널 안내는 `README-exe.txt` 의 `>` 프롬프트 표기를 따른다

## 설계 문서와 달라진 점 (2건)

구현 과정에서 확인한 제약 때문에 설계 문서의 세부를 두 곳 조정한다. 계약과 동작은 그대로다.

1. **`sp-migrate.exe` 엔트리 위치**: 설계는 `apps/api/scripts/migrate-cli.ts` 였으나 **`apps/api/src/migrate-main.ts`** 로 옮긴다.
   `build-exe.js:53` 은 `scripts/*.ts` 를 `npx tsc ... --outDir dist/scripts` 로 별도 컴파일하는데, 이 엔트리가
   `../src/prisma/migration-runner` 를 임포트하면 tsc 의 `rootDir` 추론이 `apps/api` 로 올라가면서 출력 경로가
   `dist/scripts/scripts/migrate-main.js` 로 바뀌어 ncc 엔트리가 깨진다. `src/` 안에 두면 `nest build` 가
   이미 컴파일하므로 이 문제가 사라진다.
2. **checksum 호환성 검증**: 설계는 상시 단위 테스트였으나, dev DB 존재에 의존해 CI 에서 깨지기 쉽다.
   **Task 3 의 일회성 검증 스텝**으로 바꾸고, 상시 테스트는 "알려진 입력 → 알려진 SHA-256" 형태로 둔다.

## 범위 외 (의도적으로 남기는 것)

- `apps/api/scripts/backup-cli.ts:4-9` 와 `apps/api/src/backup/backup.service.ts:49-52` 의 DB 경로 로직 중복.
  이번에 만드는 `resolveDatabaseUrl()` 로 통일할 수 있지만, 백업 CLI 동작 검증까지 끌고 들어가야 하므로 분리한다.
- 롤백(down migration).

## 파일 구조

| 파일 | 책임 |
|---|---|
| `apps/api/src/common/db-path.ts` (신규) | DB 파일 경로/DATABASE_URL 결정. `main.ts` 와 `migrate-main.ts` 가 공유 |
| `apps/api/src/prisma/sql-statements.ts` (신규) | `migration.sql` 을 실행 가능한 문장 배열로 분할 |
| `apps/api/src/prisma/migration-runner.ts` (신규) | 이력 테이블 읽기/쓰기, 미적용 목록 산출, 순차 적용, 스냅샷. 오류 타입 정의 |
| `apps/api/src/prisma/migration-messages.ts` (신규) | 관리자용 한글 안내 문구 생성 (순수 함수, 테스트 대상) |
| `apps/api/src/prisma/prisma.service.ts` (수정) | `ensureSchema()` 삭제, 부팅 판정으로 교체 |
| `apps/api/src/main.ts` (수정) | DB 경로 로직을 `db-path.ts` 로 이관 |
| `apps/api/src/migrate-main.ts` (신규) | `sp-migrate.exe` 엔트리. 백업 → 적용 → 리포트 |
| `apps/api/vitest.config.ts` (신규) | vitest 설정 |
| `apps/api/scripts/build-exe.js` (수정) | migrations 내장, `sp-migrate.exe` 번들 |
| `apps/api/scripts/README-exe.txt` (수정) | 업그레이드 절차 안내 |

`sql-statements.ts` 와 `migration-messages.ts` 를 러너에서 떼어낸 이유: 둘 다 **DB 없이 테스트 가능한 순수 함수**다. 러너 테스트는 실제 SQLite 파일이 필요해 느리므로, 빠르게 돌 수 있는 것은 분리해 둔다.

---

## Task 1: vitest 셋업과 SQL 문장 분할

**Files:**
- Modify: `apps/api/package.json` (devDependency + test 스크립트)
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/prisma/sql-statements.ts`
- Test: `apps/api/src/prisma/sql-statements.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 작업)
- Produces: `splitSqlStatements(sql: string): string[]`

- [ ] **Step 1: vitest 를 devDependency 로 추가**

저장소 루트에서 실행한다. 모노레포에 이미 있는 버전과 맞춘다.

```bash
pnpm -F @sam/api add -D vitest@2.1.8
```

- [ ] **Step 2: test 스크립트 추가**

`apps/api/package.json` 의 `scripts` 에 추가한다 (`typecheck` 아래).

```json
    "test": "vitest run",
```

- [ ] **Step 3: vitest 설정 파일 생성**

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // 실제 SQLite 파일을 다루는 통합 테스트가 있어 병렬 파일 간 간섭을 막는다.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 4: 실패하는 테스트 작성**

`apps/api/src/prisma/sql-statements.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './sql-statements';

describe('splitSqlStatements', () => {
  it('세미콜론으로 문장을 나눈다', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('마지막 세미콜론이 없어도 마지막 문장을 살린다', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('여러 줄에 걸친 단일 문장을 하나로 유지한다', () => {
    const sql = 'INSERT INTO t (a, b)\nVALUES\n  (1, 2),\n  (3, 4);';
    expect(splitSqlStatements(sql)).toEqual(['INSERT INTO t (a, b)\nVALUES\n  (1, 2),\n  (3, 4)']);
  });

  it('문자열 리터럴 안의 세미콜론에서 자르지 않는다', () => {
    const sql = "INSERT INTO t (a) VALUES ('x; y'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (a) VALUES ('x; y')",
      'SELECT 1',
    ]);
  });

  it("'' 로 escape 된 작은따옴표를 문자열의 끝으로 오해하지 않는다", () => {
    const sql = "INSERT INTO t (a) VALUES ('it''s; ok'); SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t (a) VALUES ('it''s; ok')",
      'SELECT 1',
    ]);
  });

  it('-- 라인 주석을 제거한다', () => {
    const sql = '-- RedefineTables\nSELECT 1;\n-- another; comment\nSELECT 2;';
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('빈 문장과 공백만 있는 문장은 버린다', () => {
    expect(splitSqlStatements('SELECT 1;;\n\n  ;SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('PRAGMA 문장을 그대로 보존한다', () => {
    const sql = 'PRAGMA foreign_keys=OFF;\nDROP TABLE "t";\nPRAGMA foreign_keys=ON;';
    expect(splitSqlStatements(sql)).toEqual([
      'PRAGMA foreign_keys=OFF',
      'DROP TABLE "t"',
      'PRAGMA foreign_keys=ON',
    ]);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test`
Expected: FAIL — `Failed to resolve import "./sql-statements"`

- [ ] **Step 6: 최소 구현 작성**

`apps/api/src/prisma/sql-statements.ts`:

```ts
/**
 * migration.sql 을 개별 실행 가능한 문장 배열로 나눈다.
 *
 * Prisma 의 $executeRawUnsafe 는 한 번에 한 문장만 허용하므로 파일을 쪼개야 한다.
 * 세미콜론 단순 분리로는 부족하다. 문자열 리터럴 안의 세미콜론에서 잘리면
 * seed 성격의 마이그레이션(일정 제목 등 한글 데이터)이 깨진다.
 *
 * SQLite 의 문자열 escape 는 '' (작은따옴표 두 번) 이다.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (inString) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          // '' 는 escape 된 작은따옴표. 문자열은 계속된다.
          current += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }

    // -- 부터 줄 끝까지는 주석. 개행은 남겨 문장 모양을 보존한다.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      continue;
    }

    if (ch === ';') {
      pushStatement(statements, current);
      current = '';
      continue;
    }

    current += ch;
  }

  pushStatement(statements, current);
  return statements;
}

function pushStatement(target: string[], raw: string): void {
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    target.push(trimmed);
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm -F @sam/api test`
Expected: PASS — 8 tests

- [ ] **Step 8: 실제 마이그레이션 파일로 검증**

저장소 루트에서 실행한다. 6개 마이그레이션이 모두 문장으로 쪼개지는지 눈으로 확인한다.

```bash
pnpm -F @sam/api exec node -e "
const fs=require('fs');const path=require('path');
const {splitSqlStatements}=require('./dist/prisma/sql-statements.js');
const dir='prisma/migrations';
for(const name of fs.readdirSync(dir).filter(n=>n!=='migration_lock.toml')){
  const sql=fs.readFileSync(path.join(dir,name,'migration.sql'),'utf8');
  console.log(name, '→', splitSqlStatements(sql).length, '문장');
}"
```

Expected: 6줄 출력, 각 줄의 문장 수가 1 이상. `dist` 가 없으면 먼저 `pnpm -F @sam/api build` 를 돌린다.

- [ ] **Step 9: typecheck**

Run: `pnpm -r typecheck`
Expected: 3개 워크스페이스 모두 `Done`, 0 errors

- [ ] **Step 10: 커밋**

```bash
git add apps/api/package.json apps/api/vitest.config.ts apps/api/src/prisma/sql-statements.ts apps/api/src/prisma/sql-statements.test.ts pnpm-lock.yaml
git commit -m "feat(api): migration.sql 문장 분할 유틸과 vitest 셋업"
```

---

## Task 2: 관리자 안내 메시지

**Files:**
- Create: `apps/api/src/prisma/migration-messages.ts`
- Test: `apps/api/src/prisma/migration-messages.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `formatPendingMigrationsNotice(pending: string[]): string`
  - `formatLegacySchemaNotice(): string`
  - `formatDowngradeNotice(missing: string[]): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/prisma/migration-messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  formatDowngradeNotice,
  formatLegacySchemaNotice,
  formatPendingMigrationsNotice,
} from './migration-messages';

describe('formatPendingMigrationsNotice', () => {
  const notice = formatPendingMigrationsNotice([
    '20260801093000_add_attachment',
    '20260815112000_node_tags',
  ]);

  it('업그레이드가 필요하다고 알린다', () => {
    expect(notice).toContain('데이터베이스 업그레이드가 필요합니다');
  });

  it('미적용 건수와 이름을 모두 나열한다', () => {
    expect(notice).toContain('2건');
    expect(notice).toContain('20260801093000_add_attachment');
    expect(notice).toContain('20260815112000_node_tags');
  });

  it('DB 를 건드리지 않았음을 명시한다', () => {
    expect(notice).toContain('DB 는 변경하지 않았습니다');
  });

  it('다음에 실행할 두 명령을 프롬프트 표기로 보여준다', () => {
    expect(notice).toContain('> sp-migrate.exe');
    expect(notice).toContain('> sp-server.exe');
  });

  it('창을 닫으라는 안내를 쓰지 않는다', () => {
    // 관리자는 cmd.exe / wt.exe 에서 실행하며 프로세스는 이미 종료된 상태다.
    expect(notice).not.toContain('창을 닫');
  });
});

describe('formatLegacySchemaNotice', () => {
  it('이력 테이블이 없어 진행할 수 없다고 알린다', () => {
    const notice = formatLegacySchemaNotice();
    expect(notice).toContain('_prisma_migrations');
    expect(notice).toContain('지원하지 않습니다');
  });
});

describe('formatDowngradeNotice', () => {
  it('exe 가 DB 보다 구버전이라고 알린다', () => {
    const notice = formatDowngradeNotice(['20260901120000_future_change']);
    expect(notice).toContain('구버전');
    expect(notice).toContain('20260901120000_future_change');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-messages.test.ts`
Expected: FAIL — `Failed to resolve import "./migration-messages"`

- [ ] **Step 3: 구현 작성**

`apps/api/src/prisma/migration-messages.ts`:

```ts
const LINE = '====================================================';

/**
 * 미적용 마이그레이션이 있어 서버를 시작하지 않을 때 관리자에게 보여줄 안내.
 *
 * 관리자는 cmd.exe / wt.exe 에서 sp-server.exe 를 실행하고, 이 안내가 나오는 시점에
 * 프로세스는 이미 종료되어 프롬프트로 돌아가 있다. 그래서 "창을 닫으라" 가 아니라
 * 다음에 칠 명령을 그대로 보여준다. '>' 표기는 README-exe.txt 관례를 따른다.
 */
export function formatPendingMigrationsNotice(pending: string[]): string {
  const list = pending.map((name) => `    - ${name}`).join('\n');
  return [
    LINE,
    '  데이터베이스 업그레이드가 필요합니다',
    LINE,
    '',
    `  적용되지 않은 변경사항 ${pending.length}건:`,
    list,
    '',
    '  DB 는 변경하지 않았습니다. 서버도 시작하지 않았습니다.',
    '  아래 두 명령을 차례로 실행하십시오.',
    '',
    '    > sp-migrate.exe        DB 를 백업한 뒤 업그레이드합니다',
    '    > sp-server.exe         업그레이드가 끝나면 서버를 시작합니다',
    '',
    LINE,
  ].join('\n');
}

/**
 * 테이블은 있는데 _prisma_migrations 가 없는 DB. 구버전 ensureSchema() 가 만든 것으로,
 * 어디까지 적용된 상태인지 알 수 없어 잘못 재적용하면 데이터가 날아간다.
 */
export function formatLegacySchemaNotice(): string {
  return [
    LINE,
    '  이 데이터베이스는 업그레이드할 수 없습니다',
    LINE,
    '',
    '  마이그레이션 이력 테이블(_prisma_migrations)이 없습니다.',
    '  구버전에서 만들어진 DB 로 보이며, 어디까지 적용된 상태인지 확인할 수 없습니다.',
    '  잘못 적용하면 데이터가 손실될 수 있어 지원하지 않습니다.',
    '',
    '  담당 개발자에게 이 메시지를 그대로 전달하십시오.',
    '',
    LINE,
  ].join('\n');
}

/**
 * DB 에 기록된 마이그레이션이 exe 내장 파일 목록에 없는 상태.
 * 폐쇄망에서는 구버전 exe 가 USB 로 돌아다니다 최신 DB 에 붙는 일이 실제로 생긴다.
 */
export function formatDowngradeNotice(missing: string[]): string {
  const list = missing.map((name) => `    - ${name}`).join('\n');
  return [
    LINE,
    '  실행 파일이 데이터베이스보다 구버전입니다',
    LINE,
    '',
    '  DB 에는 적용되어 있으나 이 실행 파일이 알지 못하는 변경사항이 있습니다:',
    list,
    '',
    '  더 최신 버전의 sp-server.exe 로 실행하십시오.',
    '  DB 는 변경하지 않았습니다.',
    '',
    LINE,
  ].join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-messages.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/prisma/migration-messages.ts apps/api/src/prisma/migration-messages.test.ts
git commit -m "feat(api): 마이그레이션 관련 관리자 안내 문구"
```

---

## Task 3: 이력 테이블 읽기와 checksum

**Files:**
- Create: `apps/api/src/prisma/migration-runner.ts`
- Test: `apps/api/src/prisma/migration-runner.test.ts`
- Create: `apps/api/src/prisma/test-helpers.ts` (테스트 전용 임시 DB 헬퍼)

**Interfaces:**
- Consumes: `splitSqlStatements` (Task 1)
- Produces:
  - `MIGRATIONS_TABLE_DDL: string`
  - `checksumOf(sql: string): string`
  - `ensureMigrationsTable(client: RawClient): Promise<void>`
  - `listApplied(client: RawClient): Promise<string[]>`
  - `hasMigrationsTable(client: RawClient): Promise<boolean>`
  - `isFreshDatabase(client: RawClient): Promise<boolean>`
  - `type RawClient = { $executeRawUnsafe(sql: string): Promise<unknown>; $queryRawUnsafe<T>(sql: string): Promise<T>; }`

`RawClient` 를 좁은 구조적 타입으로 두는 이유: 러너가 `PrismaClient` 전체에 묶이지 않아야 테스트에서 가볍게 다룰 수 있고, `PrismaService`(PrismaClient 상속)와 `migrate-main.ts`(PrismaClient 직접 생성) 양쪽이 그대로 들어맞는다.

- [ ] **Step 1: 테스트용 임시 DB 헬퍼 작성**

`apps/api/src/prisma/test-helpers.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

export interface TempDb {
  client: PrismaClient;
  dbPath: string;
  cleanup: () => Promise<void>;
}

/**
 * 빈 SQLite 파일을 임시 디렉터리에 만들고 연결한 PrismaClient 를 돌려준다.
 * Windows 파일 잠금 때문에 테스트마다 독립 디렉터리를 쓴다.
 */
export async function createTempDb(): Promise<TempDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migration-test-'));
  const dbPath = path.join(dir, 'test.db');
  const client = new PrismaClient({
    datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } },
  });
  await client.$connect();

  return {
    client,
    dbPath,
    cleanup: async () => {
      await client.$disconnect();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows 에서 엔진이 핸들을 늦게 놓는 경우가 있다. 임시 디렉터리라 남아도 무해하다.
      }
    },
  };
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/api/src/prisma/migration-runner.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checksumOf,
  ensureMigrationsTable,
  hasMigrationsTable,
  isFreshDatabase,
  listApplied,
} from './migration-runner';
import { createTempDb, type TempDb } from './test-helpers';

describe('checksumOf', () => {
  it('내용의 SHA-256 16진 문자열을 돌려준다', () => {
    // node -e "console.log(require('crypto').createHash('sha256').update('SELECT 1;','utf8').digest('hex'))"
    expect(checksumOf('SELECT 1;')).toBe(
      '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a',
    );
  });

  it('64자 16진 문자열이다', () => {
    expect(checksumOf('SELECT 1;')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('입력이 다르면 값이 다르다', () => {
    expect(checksumOf('SELECT 1;')).not.toBe(checksumOf('SELECT 2;'));
  });
});

describe('빈 DB 판정과 이력 테이블', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('테이블이 없으면 fresh 로 본다', async () => {
    expect(await isFreshDatabase(db.client)).toBe(true);
  });

  it('이력 테이블이 없으면 hasMigrationsTable 이 false 다', async () => {
    expect(await hasMigrationsTable(db.client)).toBe(false);
  });

  it('ensureMigrationsTable 이 이력 테이블을 만든다', async () => {
    await ensureMigrationsTable(db.client);
    expect(await hasMigrationsTable(db.client)).toBe(true);
  });

  it('ensureMigrationsTable 은 두 번 불러도 안전하다', async () => {
    await ensureMigrationsTable(db.client);
    await ensureMigrationsTable(db.client);
    expect(await hasMigrationsTable(db.client)).toBe(true);
  });

  it('이력 테이블만 있으면 여전히 fresh 로 본다', async () => {
    // _prisma_migrations 는 애플리케이션 테이블이 아니므로 판정에서 제외한다.
    await ensureMigrationsTable(db.client);
    expect(await isFreshDatabase(db.client)).toBe(true);
  });

  it('애플리케이션 테이블이 있으면 fresh 가 아니다', async () => {
    await db.client.$executeRawUnsafe('CREATE TABLE "users" ("id" TEXT PRIMARY KEY)');
    expect(await isFreshDatabase(db.client)).toBe(false);
  });

  it('적용 이력이 없으면 listApplied 가 빈 배열이다', async () => {
    await ensureMigrationsTable(db.client);
    expect(await listApplied(db.client)).toEqual([]);
  });

  it('이력 테이블이 아예 없어도 listApplied 는 빈 배열이다', async () => {
    // 읽기 전용이어야 한다. 테이블을 만들지 않는다.
    expect(await listApplied(db.client)).toEqual([]);
    expect(await hasMigrationsTable(db.client)).toBe(false);
  });

  it('rolled_back_at 이 있는 이력은 적용된 것으로 세지 않는다', async () => {
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","rolled_back_at","applied_steps_count")
       VALUES ('a','c1','20260101000000_x',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)`,
    );
    expect(await listApplied(db.client)).toEqual([]);
  });

  it('finished_at 이 없는(중단된) 이력도 적용된 것으로 세지 않는다', async () => {
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","applied_steps_count")
       VALUES ('b','c2','20260101000000_y',0)`,
    );
    expect(await listApplied(db.client)).toEqual([]);
  });
});
```

첫 테스트는 실제 해시값을 하드코딩하지 않는다. Step 4 에서 실제 값을 확인해 넣는다.

- [ ] **Step 3: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: FAIL — `Failed to resolve import "./migration-runner"`

- [ ] **Step 4: 구현 작성**

`apps/api/src/prisma/migration-runner.ts`:

```ts
import { createHash } from 'crypto';

/**
 * 러너가 필요한 최소 인터페이스. PrismaClient 전체에 묶이지 않게 해서
 * PrismaService(상속)와 migrate-main.ts(직접 생성) 양쪽에 그대로 쓰인다.
 */
export interface RawClient {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(sql: string): Promise<T>;
}

/**
 * Prisma 가 만드는 정의를 그대로 옮긴 것. 현재 dev DB 에서 추출했다.
 * 이 규약을 지키면 나중에 정식 prisma migrate 도구로 돌아갈 여지가 남는다.
 */
export const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/** Prisma 와 같은 방식: migration.sql 내용의 SHA-256 16진 문자열. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export async function ensureMigrationsTable(client: RawClient): Promise<void> {
  await client.$executeRawUnsafe(MIGRATIONS_TABLE_DDL);
}

export async function hasMigrationsTable(client: RawClient): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`,
  );
  return rows.length > 0;
}

/**
 * 테이블이 하나도 없는 새 DB 인가.
 * _prisma_migrations 와 sqlite 내부 테이블은 애플리케이션 테이블이 아니므로 제외한다.
 */
export async function isFreshDatabase(client: RawClient): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master
      WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND name <> '_prisma_migrations'`,
  );
  return rows.length === 0;
}

/**
 * 적용 완료된 마이그레이션 이름 (오름차순).
 *
 * 읽기 전용이다. 이력 테이블이 없으면 만들지 않고 빈 배열을 준다.
 * 신규 DB 인지 레거시 DB 인지는 isFreshDatabase() 결과와 조합해 가린다.
 *
 * finished_at 이 비어 있으면 적용 중 중단된 것이고, rolled_back_at 이 있으면
 * 되돌려진 것이다. 둘 다 "적용됨" 으로 세지 않는다.
 */
export async function listApplied(client: RawClient): Promise<string[]> {
  if (!(await hasMigrationsTable(client))) {
    return [];
  }
  const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name ASC`,
  );
  return rows.map((r) => r.migration_name);
}
```

- [ ] **Step 5: 테스트에 박아둔 해시값이 맞는지 확인**

테스트에 하드코딩한 기대값이 실제 SHA-256 과 같은지 독립적으로 확인한다.

```bash
node -e "console.log(require('crypto').createHash('sha256').update('SELECT 1;','utf8').digest('hex'))"
```

Expected: `17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a`

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: PASS — 이 파일의 모든 테스트 통과, 실패 0

- [ ] **Step 7: dev DB 와 checksum 호환성 일회 검증**

우리 계산이 Prisma 가 기록한 값과 같은지 확인한다. **개발 서버를 끈 상태에서** 저장소 루트에서 실행한다.

```bash
pnpm -F @sam/api exec node -e "
const {PrismaClient}=require('@prisma/client');
const {createHash}=require('crypto');
const fs=require('fs');const path=require('path');
(async()=>{
  const c=new PrismaClient();
  const rows=await c.\$queryRawUnsafe('SELECT migration_name, checksum FROM \"_prisma_migrations\" ORDER BY migration_name');
  let bad=0;
  for(const r of rows){
    const sql=fs.readFileSync(path.join('prisma/migrations',r.migration_name,'migration.sql'),'utf8');
    const mine=createHash('sha256').update(sql,'utf8').digest('hex');
    const ok=mine===r.checksum;
    if(!ok) bad++;
    console.log(ok?'OK  ':'DIFF', r.migration_name);
  }
  console.log(bad===0?'전부 일치':(bad+'건 불일치'));
  await c.\$disconnect();
})();"
```

Expected: 6줄 모두 `OK`, 마지막 줄 `전부 일치`.

불일치가 나오면 **줄바꿈 차이**가 원인일 가능성이 크다 (git `core.autocrlf` 로 워킹트리가 CRLF 인데 Prisma 는 파일을 읽은 그대로 해시). 이 경우 `checksumOf` 를 바꾸지 말고, **결과를 기록하고 다음 태스크로 진행**한다. exe 배포판의 DB 는 우리 러너만 읽고 쓰므로 자체 일관성만 있으면 동작에 문제가 없다. 발견 사실은 설계 문서 §11 에 한 줄 추가한다.

- [ ] **Step 8: typecheck 후 커밋**

Run: `pnpm -r typecheck`
Expected: 0 errors

```bash
git add apps/api/src/prisma/migration-runner.ts apps/api/src/prisma/migration-runner.test.ts apps/api/src/prisma/test-helpers.ts
git commit -m "feat(api): 마이그레이션 이력 테이블 읽기와 checksum"
```

---

## Task 4: 미적용 목록 산출과 오류 타입

**Files:**
- Modify: `apps/api/src/prisma/migration-runner.ts`
- Modify: `apps/api/src/prisma/migration-runner.test.ts`

**Interfaces:**
- Consumes: `listApplied`, `hasMigrationsTable`, `isFreshDatabase` (Task 3)
- Produces:
  - `class LegacySchemaError extends Error`
  - `class DowngradeError extends Error { readonly missing: string[] }`
  - `listMigrationFiles(dir: string): string[]`
  - `readMigrationSql(dir: string, name: string): string`
  - `listPending(client: RawClient, dir: string): Promise<string[]>`

- [ ] **Step 1: 실패하는 테스트 추가**

`apps/api/src/prisma/migration-runner.test.ts` 끝에 추가한다. 상단 import 에 `listPending`, `listMigrationFiles`, `LegacySchemaError`, `DowngradeError` 를, 그리고 `fs`/`os`/`path` 를 더한다.

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** 임시 마이그레이션 디렉터리를 만든다. entries 는 [이름, SQL] 쌍. */
function createMigrationsDir(entries: Array<[string, string]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrations-'));
  for (const [name, sql] of entries) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'migration.sql'), sql, 'utf8');
  }
  fs.writeFileSync(path.join(dir, 'migration_lock.toml'), 'provider = "sqlite"\n', 'utf8');
  return dir;
}

describe('listMigrationFiles', () => {
  it('이름 오름차순으로 돌려주고 migration_lock.toml 은 제외한다', () => {
    const dir = createMigrationsDir([
      ['20260102000000_b', 'SELECT 1;'],
      ['20260101000000_a', 'SELECT 1;'],
    ]);
    expect(listMigrationFiles(dir)).toEqual(['20260101000000_a', '20260102000000_b']);
  });
});

describe('listPending', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('빈 DB 에서는 전체가 미적용이다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);'],
      ['20260102000000_b', 'SELECT 1;'],
    ]);
    expect(await listPending(db.client, dir)).toEqual([
      '20260101000000_a',
      '20260102000000_b',
    ]);
  });

  it('적용된 것은 빼고 돌려준다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);'],
      ['20260102000000_b', 'SELECT 1;'],
    ]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('x','c','20260101000000_a',CURRENT_TIMESTAMP,1)`,
    );
    expect(await listPending(db.client, dir)).toEqual(['20260102000000_b']);
  });

  it('테이블은 있는데 이력 테이블이 없으면 LegacySchemaError 를 던진다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await db.client.$executeRawUnsafe('CREATE TABLE "users" ("id" TEXT PRIMARY KEY)');
    await expect(listPending(db.client, dir)).rejects.toThrow(LegacySchemaError);
  });

  it('이력에는 있는데 파일에 없으면 DowngradeError 를 던진다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('y','c','20260901120000_future',CURRENT_TIMESTAMP,1)`,
    );
    await expect(listPending(db.client, dir)).rejects.toThrow(DowngradeError);
  });

  it('DowngradeError 는 누락된 이름을 담는다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('y','c','20260901120000_future',CURRENT_TIMESTAMP,1)`,
    );
    await expect(listPending(db.client, dir)).rejects.toMatchObject({
      missing: ['20260901120000_future'],
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: FAIL — `listPending is not exported` 류

- [ ] **Step 3: 구현 추가**

`apps/api/src/prisma/migration-runner.ts` 에 추가한다. 상단 import 에 `fs`, `path` 를 더한다.

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * 애플리케이션 테이블은 있는데 마이그레이션 이력 테이블이 없는 DB.
 * 구버전 ensureSchema() 가 만든 것으로, 어디까지 적용됐는지 알 수 없다.
 * 조용히 재적용하면 CREATE TABLE 이 실패하거나 RedefineTables 가 데이터를 날린다.
 */
export class LegacySchemaError extends Error {
  constructor() {
    super('마이그레이션 이력 테이블(_prisma_migrations)이 없어 업그레이드할 수 없습니다.');
    this.name = 'LegacySchemaError';
  }
}

/** DB 에 기록된 마이그레이션이 내장 파일 목록에 없는 상태 (구버전 exe 로 최신 DB 를 연 경우). */
export class DowngradeError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`실행 파일이 알지 못하는 마이그레이션이 DB 에 있습니다: ${missing.join(', ')}`);
    this.name = 'DowngradeError';
    this.missing = missing;
  }
}

/** 마이그레이션 디렉터리 이름 목록 (적용 순서 = 이름 오름차순). */
export function listMigrationFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'migration.sql')))
    .sort();
}

export function readMigrationSql(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
}

/**
 * 미적용 마이그레이션 이름 (적용 순서대로).
 *
 * process.exit 을 부르지 않는다. 비정상 상태는 예외로 던지고, exit code 로 옮기는 책임은
 * 호출자(PrismaService, migrate-main.ts)가 진다. 러너를 테스트에서 그대로 쓰기 위한 조건이다.
 */
export async function listPending(client: RawClient, dir: string): Promise<string[]> {
  const files = listMigrationFiles(dir);
  const hasHistory = await hasMigrationsTable(client);

  if (!hasHistory && !(await isFreshDatabase(client))) {
    throw new LegacySchemaError();
  }

  const applied = await listApplied(client);
  const missing = applied.filter((name) => !files.includes(name));
  if (missing.length > 0) {
    throw new DowngradeError(missing);
  }

  return files.filter((name) => !applied.includes(name));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: PASS — 이 파일의 모든 테스트 통과, 실패 0 (앞 태스크의 테스트도 계속 통과해야 한다)

- [ ] **Step 5: typecheck 후 커밋**

Run: `pnpm -r typecheck`
Expected: 0 errors

```bash
git add apps/api/src/prisma/migration-runner.ts apps/api/src/prisma/migration-runner.test.ts
git commit -m "feat(api): 미적용 마이그레이션 산출과 레거시/다운그레이드 감지"
```

---

## Task 5: 마이그레이션 적용과 스냅샷

**Files:**
- Modify: `apps/api/src/prisma/migration-runner.ts`
- Modify: `apps/api/src/prisma/migration-runner.test.ts`

**Interfaces:**
- Consumes: `splitSqlStatements` (Task 1), `listPending`/`ensureMigrationsTable`/`checksumOf`/`readMigrationSql` (Task 3~4)
- Produces:
  - `class MigrationFailedError extends Error { readonly migrationName: string; readonly statementIndex: number }` — 원인 예외는 표준 `Error.cause` 에 담는다 (`apps/api/tsconfig.json` 의 `lib: ["ES2022"]` 에서 사용 가능)
  - `applyMigrations(client: RawClient, dir: string, names: string[]): Promise<void>`
  - `snapshotTo(client: RawClient, destPath: string): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 추가**

파일 끝에 추가한다. 상단 import 에 `applyMigrations`, `snapshotTo`, `MigrationFailedError` 를 더한다.

```ts
describe('applyMigrations', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('테이블을 만들고 이력에 기록한다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "users" ("id" TEXT PRIMARY KEY);'],
    ]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    expect(await listApplied(db.client)).toEqual(['20260101000000_a']);
    expect(await listPending(db.client, dir)).toEqual([]);
  });

  it('이력 테이블을 스스로 만든다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    expect(await hasMigrationsTable(db.client)).toBe(false);
    await applyMigrations(db.client, dir, ['20260101000000_a']);
    expect(await hasMigrationsTable(db.client)).toBe(true);
  });

  it('여러 마이그레이션을 주어진 순서로 적용한다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);'],
      ['20260102000000_b', 'ALTER TABLE "t" ADD COLUMN "extra" TEXT;'],
    ]);
    await applyMigrations(db.client, dir, ['20260101000000_a', '20260102000000_b']);

    const cols = await db.client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info('t')`,
    );
    expect(cols.map((c) => c.name).sort()).toEqual(['extra', 'id']);
  });

  it('여러 문장이 든 마이그레이션을 모두 실행한다', async () => {
    const dir = createMigrationsDir([
      [
        '20260101000000_a',
        `-- 주석
         CREATE TABLE "t" ("id" TEXT);
         INSERT INTO "t" ("id") VALUES ('has; semicolon');
         CREATE INDEX "t_id_idx" ON "t"("id");`,
      ],
    ]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    const rows = await db.client.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM "t"');
    expect(rows).toEqual([{ id: 'has; semicolon' }]);
  });

  it('적용한 문장 수를 이력에 남긴다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT); CREATE TABLE "u" ("id" TEXT);'],
    ]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    const rows = await db.client.$queryRawUnsafe<Array<{ applied_steps_count: number }>>(
      `SELECT applied_steps_count FROM "_prisma_migrations"`,
    );
    expect(Number(rows[0]!.applied_steps_count)).toBe(2);
  });

  it('checksum 을 이력에 남긴다', async () => {
    const sql = 'CREATE TABLE "t" ("id" TEXT);';
    const dir = createMigrationsDir([['20260101000000_a', sql]]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    const rows = await db.client.$queryRawUnsafe<Array<{ checksum: string }>>(
      `SELECT checksum FROM "_prisma_migrations"`,
    );
    expect(rows[0]!.checksum).toBe(checksumOf(sql));
  });

  it('실패하면 MigrationFailedError 를 던진다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'THIS IS NOT SQL;']]);
    await expect(applyMigrations(db.client, dir, ['20260101000000_a'])).rejects.toThrow(
      MigrationFailedError,
    );
  });

  it('실패한 마이그레이션은 이력에 기록하지 않는다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT); THIS IS NOT SQL;'],
    ]);
    await expect(
      applyMigrations(db.client, dir, ['20260101000000_a']),
    ).rejects.toThrow(MigrationFailedError);

    expect(await listApplied(db.client)).toEqual([]);
  });

  it('실패 지점(마이그레이션 이름과 문장 번호)을 담는다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT); THIS IS NOT SQL;'],
    ]);
    await expect(
      applyMigrations(db.client, dir, ['20260101000000_a']),
    ).rejects.toMatchObject({
      migrationName: '20260101000000_a',
      statementIndex: 2,
    });
  });

  it('앞 마이그레이션이 실패하면 뒤는 실행하지 않는다', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'THIS IS NOT SQL;'],
      ['20260102000000_b', 'CREATE TABLE "should_not_exist" ("id" TEXT);'],
    ]);
    await expect(
      applyMigrations(db.client, dir, ['20260101000000_a', '20260102000000_b']),
    ).rejects.toThrow(MigrationFailedError);

    const tables = await db.client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_exist'`,
    );
    expect(tables).toEqual([]);
  });
});

describe('snapshotTo', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('데이터가 담긴 단일 파일을 만든다', async () => {
    await db.client.$executeRawUnsafe('CREATE TABLE "t" ("id" TEXT)');
    await db.client.$executeRawUnsafe(`INSERT INTO "t" ("id") VALUES ('v1')`);

    const dest = path.join(path.dirname(db.dbPath), 'snap.db');
    await snapshotTo(db.client, dest);

    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.statSync(dest).size).toBeGreaterThan(0);
  });

  it("경로에 작은따옴표가 있어도 동작한다", async () => {
    await db.client.$executeRawUnsafe('CREATE TABLE "t" ("id" TEXT)');
    const dest = path.join(path.dirname(db.dbPath), "it's snap.db");
    await snapshotTo(db.client, dest);
    expect(fs.existsSync(dest)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: FAIL — `applyMigrations is not exported` 류

- [ ] **Step 3: 구현 추가**

`apps/api/src/prisma/migration-runner.ts` 에 추가한다. 상단 import 에 `randomUUID` 와 `splitSqlStatements` 를 더한다.

```ts
import { createHash, randomUUID } from 'crypto';
import { splitSqlStatements } from './sql-statements';

/** 마이그레이션 적용 중 SQL 이 실패한 경우. 어느 마이그레이션의 몇 번째 문장인지 담는다. */
export class MigrationFailedError extends Error {
  readonly migrationName: string;
  readonly statementIndex: number;

  constructor(migrationName: string, statementIndex: number, cause: unknown) {
    super(
      `마이그레이션 '${migrationName}' 의 ${statementIndex}번째 문장에서 실패했습니다: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'MigrationFailedError';
    this.migrationName = migrationName;
    this.statementIndex = statementIndex;
    this.cause = cause;
  }
}

/**
 * 주어진 마이그레이션을 순서대로 적용하고 이력에 기록한다.
 *
 * 트랜잭션으로 감싸지 않는다. Prisma 의 $transaction 안에서는 PRAGMA 가 동작하지 않아,
 * 마이그레이션 SQL 이 스스로 하는 FK 제어(PRAGMA foreign_keys=OFF / defer_foreign_keys)가
 * 무력화되어 오히려 위험해진다. 원자성은 트랜잭션이 아니라 사전 백업으로 확보한다.
 *
 * 실패하면 즉시 중단하고 그 마이그레이션은 이력에 기록하지 않는다. 뒤의 것도 실행하지 않는다.
 */
export async function applyMigrations(
  client: RawClient,
  dir: string,
  names: string[],
): Promise<void> {
  await ensureMigrationsTable(client);

  for (const name of names) {
    const sql = readMigrationSql(dir, name);
    const statements = splitSqlStatements(sql);

    for (let i = 0; i < statements.length; i += 1) {
      try {
        await client.$executeRawUnsafe(statements[i]!);
      } catch (err) {
        // 1-based 로 알린다. 관리자가 파일을 열어 세기 좋다.
        throw new MigrationFailedError(name, i + 1, err);
      }
    }

    await recordApplied(client, name, checksumOf(sql), statements.length);
  }
}

async function recordApplied(
  client: RawClient,
  name: string,
  checksum: string,
  steps: number,
): Promise<void> {
  // VALUES 에 파라미터를 쓸 수 없는 상황이 아니지만, $executeRawUnsafe 로 일관되게 다룬다.
  // name/checksum 은 파일시스템과 해시에서 온 값이라 인용부호만 escape 하면 충분하다.
  const escapedName = name.replace(/'/g, "''");
  await client.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
     VALUES ('${randomUUID()}','${checksum}','${escapedName}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,${steps})`,
  );
}

/**
 * SQLite 스냅샷을 destPath 에 만든다.
 *
 * VACUUM INTO 를 쓰는 이유는 WAL 모드에서 아직 병합되지 않은 내용까지 포함한
 * 일관된 단일 파일을 얻기 위해서다. 파일 복사로는 이걸 보장할 수 없다.
 * BackupService(backup.service.ts:109) 와 같은 방식이다.
 *
 * BackupService 를 재사용하지 않는 이유: 그쪽은 PrismaService 에 의존하는 Nest 프로바이더인데
 * 마이그레이션은 PrismaService 초기화 도중에 일어나므로 순환 의존이 생긴다.
 */
export async function snapshotTo(client: RawClient, destPath: string): Promise<void> {
  // VACUUM INTO 는 prepared parameter 미지원 → 인라인. SQLite 는 '' 로 escape.
  const escaped = destPath.replace(/'/g, "''");
  await client.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: PASS — 이 파일의 모든 테스트 통과, 실패 0 (앞 태스크의 테스트도 계속 통과해야 한다)

- [ ] **Step 5: 실제 마이그레이션 6개로 통합 검증 테스트 추가**

파일 끝에 추가한다. 이 설계의 유일한 실질 위험 지점이므로 목으로 대체하지 않는다.

```ts
describe('실제 prisma/migrations 적용', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('빈 DB 에 전체를 적용하면 미적용분이 0 이 된다', async () => {
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    const pending = await listPending(db.client, dir);
    expect(pending.length).toBeGreaterThan(0);

    await applyMigrations(db.client, dir, pending);

    expect(await listPending(db.client, dir)).toEqual([]);
  });

  it('적용 후 핵심 테이블과 인덱스가 존재한다', async () => {
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    await applyMigrations(db.client, dir, await listPending(db.client, dir));

    const names = await db.client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`,
    );
    const set = new Set(names.map((n) => n.name));
    for (const expected of [
      'users',
      'projects',
      'project_members',
      'schedule_nodes',
      'node_comments',
      'node_history',
      'audit_logs',
      'sessions',
      'autocomplete_terms',
      'users_username_key',
      'schedule_nodes_project_id_parent_id_sort_order_idx',
    ]) {
      expect(set.has(expected)).toBe(true);
    }
  });

  it('progress 컬럼이 CHECK 제약과 함께 만들어진다', async () => {
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    await applyMigrations(db.client, dir, await listPending(db.client, dir));

    const cols = await db.client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info('schedule_nodes')`,
    );
    expect(cols.map((c) => c.name)).toContain('progress');
  });

  it('seed 마이그레이션의 한글 데이터가 들어간다', async () => {
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    await applyMigrations(db.client, dir, await listPending(db.client, dir));

    const rows = await db.client.$queryRawUnsafe<Array<{ title: string }>>(
      `SELECT title FROM "autocomplete_terms" WHERE title = '요구사항 분석'`,
    );
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 6: 통합 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/migration-runner.test.ts`
Expected: PASS — 이 파일의 모든 테스트 통과, 실패 0. 특히 "실제 prisma/migrations 적용" 4건이 모두 통과해야 한다

실패하면 여기서 멈춘다. 마이그레이션 SQL 이 우리 러너로 실행되지 않는다는 뜻이고, 이후 태스크는 의미가 없다.

- [ ] **Step 7: typecheck 후 커밋**

Run: `pnpm -r typecheck`
Expected: 0 errors

```bash
git add apps/api/src/prisma/migration-runner.ts apps/api/src/prisma/migration-runner.test.ts
git commit -m "feat(api): 마이그레이션 순차 적용과 VACUUM INTO 스냅샷"
```

---

## Task 6: DB 경로와 migrations 디렉터리 해석

**Files:**
- Create: `apps/api/src/common/db-path.ts`
- Modify: `apps/api/src/main.ts:12-38`
- Modify: `apps/api/src/prisma/migration-runner.ts` (`resolveMigrationsDir` 추가)
- Test: `apps/api/src/common/db-path.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `resolveDatabaseUrl(): string` — `DATABASE_URL` 이 없으면 `<cwd>/data/sam.db` 기준으로 만들고 디렉터리도 생성
  - `resolveDbFilePath(): string` — `file:` 접두어를 뗀 실제 파일 경로
  - `bindPrismaQueryEngine(): void` — `PRISMA_QUERY_ENGINE_LIBRARY` 바인딩
  - `resolveMigrationsDir(): string` — exe/로컬 양쪽에서 `migrations/` 위치 탐색

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/common/db-path.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDatabaseUrl, resolveDbFilePath } from './db-path';

describe('resolveDatabaseUrl', () => {
  const original = process.env.DATABASE_URL;
  let cwd: string;
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-dbpath-'));
    process.chdir(cwd);
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('DATABASE_URL 이 있으면 그대로 쓴다', () => {
    process.env.DATABASE_URL = 'file:/tmp/custom.db';
    expect(resolveDatabaseUrl()).toBe('file:/tmp/custom.db');
  });

  it('없으면 cwd/data/sam.db 로 만든다', () => {
    const url = resolveDatabaseUrl();
    expect(url.startsWith('file:')).toBe(true);
    expect(url.endsWith('/data/sam.db')).toBe(true);
  });

  it('data 디렉터리를 만들어 둔다', () => {
    resolveDatabaseUrl();
    expect(fs.existsSync(path.join(cwd, 'data'))).toBe(true);
  });

  it('경로 구분자를 슬래시로 정규화한다 (Prisma 요구사항)', () => {
    expect(resolveDatabaseUrl()).not.toContain('\\');
  });
});

describe('resolveDbFilePath', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });

  it('file: 접두어를 뗀 경로를 준다', () => {
    process.env.DATABASE_URL = 'file:/tmp/custom.db';
    expect(resolveDbFilePath()).toBe('/tmp/custom.db');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/common/db-path.test.ts`
Expected: FAIL — `Failed to resolve import "./db-path"`

- [ ] **Step 3: 구현 작성**

`apps/api/src/common/db-path.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * DB 연결 문자열을 결정한다. 원래 main.ts 의 setupEnvironment() 안에 있던 로직을 옮긴 것으로,
 * sp-server.exe 와 sp-migrate.exe 가 반드시 같은 파일을 열게 하려고 공용으로 뺐다.
 * 두 exe 가 서로 다른 파일을 열면 조용히 어긋난다.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'sam.db');
  // Prisma SQLite connection string format
  return `file:${dbPath.replace(/\\/g, '/')}`;
}

/** DATABASE_URL 에서 실제 파일 경로만 뽑는다. */
export function resolveDbFilePath(): string {
  const url = resolveDatabaseUrl();
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

/**
 * Prisma Query Engine 바이너리 경로 바인딩 (exe 동일 디렉터리 탐색).
 * 원래 main.ts 에 있던 로직을 그대로 옮겼다.
 */
export function bindPrismaQueryEngine(): void {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    return;
  }
  const candidateFiles = [
    path.join(process.cwd(), 'query_engine-windows.dll.node'),
    path.join(path.dirname(process.execPath), 'query_engine-windows.dll.node'),
    path.join(__dirname, 'query_engine-windows.dll.node'),
    path.join(__dirname, 'client', 'query_engine-windows.dll.node'),
  ];
  for (const f of candidateFiles) {
    if (fs.existsSync(f)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = f;
      break;
    }
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/common/db-path.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: `main.ts` 를 공용 함수로 교체**

`apps/api/src/main.ts:12-38` 의 `setupEnvironment()` 를 아래로 바꾼다. `fs` 임포트가 파일의 다른 곳에서도 쓰이는지 확인하고, 쓰이지 않으면 그때만 지운다.

```ts
function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = resolveDatabaseUrl();
  }
  bindPrismaQueryEngine();
}
```

상단에 임포트를 추가한다.

```ts
import { bindPrismaQueryEngine, resolveDatabaseUrl } from './common/db-path';
```

- [ ] **Step 6: `resolveMigrationsDir()` 추가**

`apps/api/src/prisma/migration-runner.ts` 에 추가한다.

```ts
/**
 * migrations 디렉터리 위치를 찾는다.
 *
 * exe 에서는 pkg snapshot 안에 'migrations' 로 내장되고, 로컬에서는 prisma/migrations 에 있다.
 * 후보 경로 중 존재하는 첫 항목을 쓰는 방식은 app.module.ts:26-30 의 정적 자원 탐색과 같은 패턴이다.
 */
export function resolveMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '..', 'migrations'),
    path.join(process.cwd(), 'migrations'),
    path.join(__dirname, '..', '..', 'prisma', 'migrations'),
    path.join(process.cwd(), 'prisma', 'migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  throw new Error(
    `마이그레이션 디렉터리를 찾을 수 없습니다. 탐색한 경로:\n${candidates.join('\n')}`,
  );
}
```

- [ ] **Step 7: `resolveMigrationsDir` 테스트 추가**

`apps/api/src/prisma/migration-runner.test.ts` 끝에 추가한다 (import 에 `resolveMigrationsDir` 추가).

```ts
describe('resolveMigrationsDir', () => {
  it('로컬 개발 환경에서 실제 마이그레이션 디렉터리를 찾는다', () => {
    const dir = resolveMigrationsDir();
    expect(fs.existsSync(path.join(dir, 'migration_lock.toml'))).toBe(true);
  });
});
```

- [ ] **Step 8: 전체 테스트와 typecheck**

Run: `pnpm -F @sam/api test`
Expected: PASS — 전체 통과

Run: `pnpm -r typecheck`
Expected: 0 errors

- [ ] **Step 9: 서버가 여전히 뜨는지 확인**

Run: `pnpm -F @sam/api build && pnpm -F @sam/api start`
Expected: Nest 부팅 로그, `Mapped {/api/v1/health, GET} route` 까지 출력. 확인 후 Ctrl+C.

- [ ] **Step 10: 커밋**

```bash
git add apps/api/src/common/db-path.ts apps/api/src/common/db-path.test.ts apps/api/src/main.ts apps/api/src/prisma/migration-runner.ts apps/api/src/prisma/migration-runner.test.ts
git commit -m "refactor(api): DB 경로/엔진 바인딩을 공용 모듈로 추출하고 migrations 경로 해석 추가"
```

---

## Task 7: `PrismaService` 부팅 판정

**Files:**
- Modify: `apps/api/src/prisma/prisma.service.ts` (전면 교체)
- Test: `apps/api/src/prisma/boot-decision.test.ts`
- Create: `apps/api/src/prisma/boot-decision.ts`

**Interfaces:**
- Consumes: `listPending`, `isFreshDatabase`, `applyMigrations`, `resolveMigrationsDir`, `LegacySchemaError`, `DowngradeError` (Task 3~6), `formatPendingMigrationsNotice`, `formatLegacySchemaNotice`, `formatDowngradeNotice` (Task 2)
- Produces:
  - `type BootDecision = { kind: 'boot' } | { kind: 'apply'; names: string[] } | { kind: 'halt'; exitCode: number; notice: string }`
  - `decideBoot(client: RawClient, dir: string): Promise<BootDecision>`

판정을 `PrismaService` 밖의 순수 함수로 빼는 이유: `process.exit` 없이 결과를 값으로 검증할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/prisma/boot-decision.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decideBoot } from './boot-decision';
import { applyMigrations, ensureMigrationsTable } from './migration-runner';
import { createTempDb, type TempDb } from './test-helpers';

function createMigrationsDir(entries: Array<[string, string]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-boot-'));
  for (const [name, sql] of entries) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'migration.sql'), sql, 'utf8');
  }
  return dir;
}

describe('decideBoot', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('빈 DB 면 전체를 직접 적용하라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    const decision = await decideBoot(db.client, dir);
    expect(decision).toEqual({ kind: 'apply', names: ['20260101000000_a'] });
  });

  it('최신이면 그냥 부팅하라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);
    expect(await decideBoot(db.client, dir)).toEqual({ kind: 'boot' });
  });

  it('미적용분이 있으면 exit 3 으로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    fs.mkdirSync(path.join(dir, '20260102000000_b'));
    fs.writeFileSync(
      path.join(dir, '20260102000000_b', 'migration.sql'),
      'ALTER TABLE "t" ADD COLUMN "x" TEXT;',
      'utf8',
    );

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(3);
    expect(decision.notice).toContain('20260102000000_b');
    expect(decision.notice).toContain('> sp-migrate.exe');
  });

  it('레거시 DB 면 exit 4 로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await db.client.$executeRawUnsafe('CREATE TABLE "users" ("id" TEXT PRIMARY KEY)');

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(4);
    expect(decision.notice).toContain('_prisma_migrations');
  });

  it('다운그레이드면 exit 5 로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('z','c','20260901120000_future',CURRENT_TIMESTAMP,1)`,
    );

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(5);
    expect(decision.notice).toContain('20260901120000_future');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/prisma/boot-decision.test.ts`
Expected: FAIL — `Failed to resolve import "./boot-decision"`

- [ ] **Step 3: 구현 작성**

`apps/api/src/prisma/boot-decision.ts`:

```ts
import {
  DowngradeError,
  LegacySchemaError,
  isFreshDatabase,
  listPending,
  type RawClient,
} from './migration-runner';
import {
  formatDowngradeNotice,
  formatLegacySchemaNotice,
  formatPendingMigrationsNotice,
} from './migration-messages';

export type BootDecision =
  | { kind: 'boot' }
  | { kind: 'apply'; names: string[] }
  | { kind: 'halt'; exitCode: number; notice: string };

/**
 * 부팅 시 DB 상태를 판정한다. 부작용이 없어 값으로 검증할 수 있다.
 *
 * - 테이블이 하나도 없는 새 DB: sp-server.exe 가 직접 적용한다. 잃을 데이터가 없는
 *   유일한 상태이고, README-exe.txt 가 안내하는 "최초 실행 시 자동 초기화" 1단계 UX 를 지킨다.
 * - 미적용분이 있는 기존 DB: DB 를 건드리지 않고 멈춘다. 적용은 sp-migrate.exe 가 한다.
 */
export async function decideBoot(client: RawClient, dir: string): Promise<BootDecision> {
  let pending: string[];
  try {
    pending = await listPending(client, dir);
  } catch (err) {
    if (err instanceof LegacySchemaError) {
      return { kind: 'halt', exitCode: 4, notice: formatLegacySchemaNotice() };
    }
    if (err instanceof DowngradeError) {
      return { kind: 'halt', exitCode: 5, notice: formatDowngradeNotice(err.missing) };
    }
    throw err;
  }

  if (pending.length === 0) {
    return { kind: 'boot' };
  }

  if (await isFreshDatabase(client)) {
    return { kind: 'apply', names: pending };
  }

  return { kind: 'halt', exitCode: 3, notice: formatPendingMigrationsNotice(pending) };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/prisma/boot-decision.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: `PrismaService` 교체**

`apps/api/src/prisma/prisma.service.ts` 전체를 아래로 바꾼다. `ensureSchema()` 의 하드코딩 DDL 130여 줄이 사라진다 — 첫 마이그레이션이 같은 테이블을 만들므로 역할이 겹치고, 이것이 이중 원본의 실체였다.

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { decideBoot } from './boot-decision';
import { MigrationFailedError, applyMigrations, resolveMigrationsDir } from './migration-runner';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode 는 결과 행을 반환하므로 $queryRawUnsafe 사용.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');

    // 마이그레이션은 foreign_keys=ON 앞에서 처리한다.
    // 마이그레이션 SQL 이 RedefineTables 패턴에서 FK 를 꺼야 동작하기 때문이다.
    await this.handleMigrations();

    await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
  }

  private async handleMigrations(): Promise<void> {
    const dir = resolveMigrationsDir();
    const decision = await decideBoot(this, dir);

    if (decision.kind === 'boot') {
      return;
    }

    if (decision.kind === 'apply') {
      this.logger.log(`새 데이터베이스입니다. 마이그레이션 ${decision.names.length}건을 적용합니다.`);
      try {
        await applyMigrations(this, dir, decision.names);
      } catch (err) {
        // 새 DB 초기화가 중간에 깨진 상태다. 반쪽 스키마로 서버를 띄우면 안 된다.
        // 잃을 데이터가 없는 상태이므로 복구 방법은 DB 파일 삭제 후 재시도가 가장 확실하다.
        const detail = err instanceof MigrationFailedError ? err.message : String(err);
        console.error('');
        console.error('데이터베이스 초기화에 실패했습니다.');
        console.error(`  ${detail}`);
        console.error('  data/sam.db 파일을 삭제한 뒤 다시 실행하십시오.');
        console.error('  계속 실패하면 담당 개발자에게 이 메시지를 그대로 전달하십시오.');
        console.error('');
        this.logger.error(`database initialization failed: ${detail}`);
        await this.$disconnect();
        process.exit(1);
      }
      this.logger.log('데이터베이스 초기화를 완료했습니다.');
      return;
    }

    // 관리자가 탐색기에서 더블클릭해 실행하면 콘솔이 순간적으로 닫힌다.
    // 그래서 표준 출력과 로거 양쪽에 남긴다. "키를 누르면 종료" 같은 대기는 넣지 않는다 —
    // 서비스 래퍼나 스크립트로 자동 기동할 때 프로세스가 멈춰버린다.
    console.error(decision.notice);
    this.logger.error(decision.notice);
    await this.$disconnect();
    process.exit(decision.exitCode);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 6: 전체 테스트와 typecheck**

Run: `pnpm -F @sam/api test`
Expected: PASS — 전체 통과

Run: `pnpm -r typecheck`
Expected: 0 errors

- [ ] **Step 7: 기존 dev DB 로 정상 부팅 확인**

기존 dev DB 는 `_prisma_migrations` 가 있고 최신 상태이므로 `boot` 판정이 나와야 한다.

Run: `pnpm -F @sam/api build && pnpm -F @sam/api start`
Expected: 마이그레이션 관련 안내 없이 Nest 부팅 로그. 확인 후 Ctrl+C.

- [ ] **Step 8: 빈 DB 에서 자동 초기화 확인**

```bash
pnpm -F @sam/api exec node -e "
const fs=require('fs');const path=require('path');
const dir=fs.mkdtempSync(require('os').tmpdir()+'/sam-fresh-');
console.log('DATABASE_URL=file:'+path.join(dir,'fresh.db').replace(/\\\\/g,'/'));"
```

출력된 URL 을 환경변수로 주고 서버를 띄운다 (`<URL>` 치환).

Run: `pnpm -F @sam/api exec cross-env-shell "DATABASE_URL=<URL> node dist/main.js"`

`cross-env` 가 없으면 PowerShell 에서 `$env:DATABASE_URL='<URL>'` 를 먼저 설정하고 `node apps/api/dist/main.js` 를 실행한다.

Expected: `새 데이터베이스입니다. 마이그레이션 6건을 적용합니다.` → `데이터베이스 초기화를 완료했습니다.` → 정상 부팅. 확인 후 Ctrl+C.

- [ ] **Step 9: 커밋**

```bash
git add apps/api/src/prisma/boot-decision.ts apps/api/src/prisma/boot-decision.test.ts apps/api/src/prisma/prisma.service.ts
git commit -m "feat(api): 부팅 시 마이그레이션 판정 도입, ensureSchema 하드코딩 DDL 제거"
```

---

## Task 8: `sp-migrate.exe` 엔트리

**Files:**
- Create: `apps/api/src/migrate-main.ts`
- Test: `apps/api/src/migrate-main.test.ts`

**Interfaces:**
- Consumes: `resolveDatabaseUrl`, `resolveDbFilePath`, `bindPrismaQueryEngine` (Task 6), 러너 전체 (Task 3~6)
- Produces:
  - `resolvePreMigrateBackupPath(now: Date): string`
  - `runMigrate(): Promise<number>` — exit code 를 돌려주고 `process.exit` 은 부르지 않는다

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/api/src/migrate-main.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolvePreMigrateBackupPath } from './migrate-main';

describe('resolvePreMigrateBackupPath', () => {
  const at = new Date(2026, 6, 29, 21, 5, 3); // 2026-07-29 21:05:03 (월은 0-based)

  it('backups/pre-migrate 아래에 만든다', () => {
    const p = resolvePreMigrateBackupPath(at).replace(/\\/g, '/');
    expect(p).toContain('/backups/pre-migrate/');
  });

  it('sam_YYYYMMDD_HHMMSS.db 형식이다', () => {
    expect(resolvePreMigrateBackupPath(at)).toMatch(/sam_20260729_210503\.db$/);
  });
});
```

`pre-migrate/` 를 따로 두는 이유는 일상 백업(`backups/<날짜>/`)의 14일 보존 정책에 섞여 지워지지 않게 하기 위해서다. 업그레이드 직전 스냅샷은 문제가 뒤늦게 발견될 수 있어 더 오래 남아야 한다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인**

Run: `pnpm -F @sam/api test src/migrate-main.test.ts`
Expected: FAIL — `Failed to resolve import "./migrate-main"`

- [ ] **Step 3: 구현 작성**

`apps/api/src/migrate-main.ts`:

```ts
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { bindPrismaQueryEngine, resolveDatabaseUrl, resolveDbFilePath } from './common/db-path';
import {
  DowngradeError,
  LegacySchemaError,
  MigrationFailedError,
  applyMigrations,
  listPending,
  resolveMigrationsDir,
  snapshotTo,
} from './prisma/migration-runner';
import {
  formatDowngradeNotice,
  formatLegacySchemaNotice,
} from './prisma/migration-messages';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 업그레이드 직전 스냅샷 경로.
 * 일상 백업(backups/<날짜>/)의 14일 보존 정책에 섞이지 않도록 pre-migrate/ 로 분리한다.
 */
export function resolvePreMigrateBackupPath(now: Date): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return path.join(process.cwd(), 'backups', 'pre-migrate', `sam_${stamp}.db`);
}

/** exit code 를 돌려준다. process.exit 은 호출자가 부른다. */
export async function runMigrate(): Promise<number> {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  bindPrismaQueryEngine();

  const dbPath = resolveDbFilePath();
  if (!fs.existsSync(dbPath)) {
    console.error(`DB 파일이 없습니다: ${dbPath}`);
    console.error('먼저 sp-server.exe 를 실행하면 데이터베이스가 자동으로 만들어집니다.');
    return 1;
  }

  const dir = resolveMigrationsDir();
  const client = new PrismaClient();

  try {
    await client.$connect();
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;');

    let pending: string[];
    try {
      pending = await listPending(client, dir);
    } catch (err) {
      if (err instanceof LegacySchemaError) {
        console.error(formatLegacySchemaNotice());
        return 4;
      }
      if (err instanceof DowngradeError) {
        console.error(formatDowngradeNotice(err.missing));
        return 5;
      }
      throw err;
    }

    if (pending.length === 0) {
      console.log('데이터베이스는 이미 최신입니다. 할 일이 없습니다.');
      return 0;
    }

    console.log(`적용할 변경사항 ${pending.length}건:`);
    for (const name of pending) {
      console.log(`  - ${name}`);
    }
    console.log('');

    const backupPath = resolvePreMigrateBackupPath(new Date());
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    console.log('업그레이드 전 백업을 만듭니다...');
    await snapshotTo(client, backupPath);
    console.log(`  백업 완료: ${backupPath}`);
    console.log('');

    try {
      for (const name of pending) {
        console.log(`적용 중: ${name}`);
        await applyMigrations(client, dir, [name]);
      }
    } catch (err) {
      if (err instanceof MigrationFailedError) {
        console.error('');
        console.error('====================================================');
        console.error('  업그레이드가 실패했습니다');
        console.error('====================================================');
        console.error('');
        console.error(`  실패 지점: ${err.migrationName} 의 ${err.statementIndex}번째 문장`);
        console.error(`  원인: ${err.message}`);
        console.error('');
        console.error('  DB 가 중간 상태일 수 있습니다. 아래 백업 파일로 되돌리십시오.');
        console.error(`    ${backupPath}`);
        console.error('');
        console.error('  담당 개발자에게 이 메시지를 그대로 전달하십시오.');
        console.error('');
        console.error('====================================================');
        return 1;
      }
      throw err;
    }

    console.log('');
    console.log('====================================================');
    console.log(`  업그레이드 완료 — ${pending.length}건 적용`);
    console.log('====================================================');
    console.log('');
    console.log('  이제 sp-server.exe 를 실행하십시오.');
    console.log('');
    return 0;
  } finally {
    await client.$disconnect();
  }
}

// pkg 로 만든 실행 파일의 엔트리. 테스트에서 임포트할 때는 실행되지 않아야 하므로 분리한다.
if (require.main === module) {
  runMigrate()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('예상하지 못한 오류로 중단했습니다:', err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/api test src/migrate-main.test.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: 실제 업그레이드 흐름을 손으로 검증**

임시 작업 디렉터리를 만들어 "구버전 DB → 신규 마이그레이션 추가 → 서버 거부 → migrate → 서버 정상" 을 확인한다.

1) 임시 디렉터리에서 빈 DB 로 서버를 띄워 초기화한 뒤 종료한다 (Task 7 Step 8 과 같은 방식).
2) 새 마이그레이션을 하나 만든다.

```bash
mkdir -p apps/api/prisma/migrations/29991231000000_tmp_probe
echo 'ALTER TABLE "users" ADD COLUMN "tmp_probe" TEXT;' > apps/api/prisma/migrations/29991231000000_tmp_probe/migration.sql
```

3) 같은 DB 로 서버를 다시 띄운다.
Expected: `데이터베이스 업그레이드가 필요합니다` 안내 + `29991231000000_tmp_probe` + exit code 3.

exit code 확인 (PowerShell): `$LASTEXITCODE` 가 `3`

4) migrate 를 실행한다.

Run: `node apps/api/dist/migrate-main.js` (DATABASE_URL 을 같은 값으로 설정한 상태)
Expected: 백업 경로 출력 → `적용 중: 29991231000000_tmp_probe` → `업그레이드 완료 — 1건 적용`. `backups/pre-migrate/` 에 파일 생성 확인.

5) 서버를 다시 띄운다.
Expected: 안내 없이 정상 부팅.

6) **정리 — 반드시 수행한다.**

```bash
rm -rf apps/api/prisma/migrations/29991231000000_tmp_probe
```

`git status` 로 임시 마이그레이션이 남지 않았는지 확인한다.

- [ ] **Step 6: typecheck 후 커밋**

Run: `pnpm -r typecheck`
Expected: 0 errors

```bash
git add apps/api/src/migrate-main.ts apps/api/src/migrate-main.test.ts
git commit -m "feat(api): sp-migrate 엔트리 — 사전 백업 후 마이그레이션 적용"
```

---

## Task 9: `build-exe.js` — migrations 내장과 `sp-migrate.exe`

**Files:**
- Modify: `apps/api/scripts/build-exe.js`

**Interfaces:**
- Consumes: `apps/api/src/migrate-main.ts` (Task 8) → `nest build` 결과 `dist/migrate-main.js`
- Produces: `dist-exe/sp-migrate.exe`, `sp-server.exe` 내장 `migrations/`

- [ ] **Step 1: migrations 복사 헬퍼와 asset 설정 추가**

`build-exe.js` 의 `4/5` 단계에서 서버 번들 `public` 복사 직후(현재 66~80번째 줄 부근)에 추가한다.

```js
  // 마이그레이션 SQL 을 번들 디렉터리로 복사해 pkg assets 로 내장한다.
  // sp-server.exe 도 판정에 파일 목록이 필요하므로 함께 내장한다 (SQL 내용은 쓰지 않지만 이름 비교용).
  const migrationsSrcDir = path.join(apiDir, 'prisma', 'migrations');
  copyDirRecursive(migrationsSrcDir, path.join(serverBundleDir, 'migrations'));
  console.log('✅ 마이그레이션 SQL 내장 (server)');
```

그리고 `serverPkgConfig` 의 `assets` 를 아래로 바꾼다.

```js
    pkg: {
      assets: ['public/**/*', 'migrations/**/*'],
    },
```

- [ ] **Step 2: migrate 번들 생성 추가**

`4/5` 단계의 reset-admin 번들링 줄 다음(현재 85번째 줄 부근)에 추가한다.

```js
  // 마이그레이션 CLI 번들링 (src/migrate-main.ts → nest build 산출물)
  const migrateBundleDir = path.join(bundleOutDir, 'migrate');
  run(`npx ncc build dist/migrate-main.js -o dist-bundle/migrate --no-cache`, apiDir);
  copyDirRecursive(migrationsSrcDir, path.join(migrateBundleDir, 'migrations'));

  const migratePkgConfig = {
    name: 'seedcore-scheduler-migrate',
    bin: 'index.js',
    pkg: {
      assets: ['migrations/**/*'],
    },
  };
  fs.writeFileSync(
    path.join(migrateBundleDir, 'package.json'),
    JSON.stringify(migratePkgConfig, null, 2),
  );
  console.log('✅ 마이그레이션 SQL 내장 (migrate)');
```

- [ ] **Step 3: exe 생성 추가**

`5/5` 단계의 `sp-reset-admin.exe` 생성 줄 다음(현재 100번째 줄 부근)에 추가한다.

```js
  // 4) sp-migrate.exe (마이그레이션 SQL 내장)
  run(`npx pkg dist-bundle/migrate/package.json --target ${pkgTarget} --output ${path.join(outputDistDir, 'sp-migrate.exe')}`, apiDir);
```

- [ ] **Step 4: 완료 출력에 추가**

`5/5` 단계 끝의 콘솔 출력 목록(현재 146~150번째 줄 부근)에서 `sp-migrate.exe` 를 넣고 README 번호를 조정한다.

```js
  console.log(`    3) ${path.join(outputDistDir, 'sp-reset-admin.exe')}`);
  console.log(`    4) ${path.join(outputDistDir, 'sp-migrate.exe')}`);
  console.log(`    5) ${path.join(outputDistDir, 'README.txt')}`);
```

- [ ] **Step 5: exe 빌드 실행**

**개발 서버를 끈 상태에서** 저장소 루트에서 실행한다 (Prisma 엔진 DLL 잠금 회피).

Run: `pnpm build:exe`
Expected: `🎉 Windows 단일 실행 파일(.exe) 빌드 완료!` 와 4개 exe + README.txt 경로 출력

- [ ] **Step 6: exe 산출물 확인**

```bash
ls -la dist-exe/
```

Expected: `sp-server.exe`, `sp-backup.exe`, `sp-reset-admin.exe`, `sp-migrate.exe`, `README.txt`, `query_engine-windows.dll.node`

- [ ] **Step 7: exe 를 빈 디렉터리에서 실제로 돌려본다**

내장 자원 탐색(`resolveMigrationsDir`)이 pkg snapshot 안에서 동작하는지가 이 태스크의 핵심 위험이다.

```bash
mkdir -p /tmp/sam-exe-test && cp dist-exe/sp-server.exe dist-exe/sp-migrate.exe dist-exe/query_engine-windows.dll.node /tmp/sam-exe-test/
```

`/tmp/sam-exe-test` 에서 `sp-server.exe` 를 실행한다.
Expected: `새 데이터베이스입니다. 마이그레이션 6건을 적용합니다.` → 정상 부팅 → `data/sam.db` 생성. Ctrl+C 로 종료.

이어서 `sp-migrate.exe` 를 실행한다.
Expected: `데이터베이스는 이미 최신입니다. 할 일이 없습니다.` exit 0

- [ ] **Step 8: 커밋**

```bash
git add apps/api/scripts/build-exe.js
git commit -m "build(exe): 마이그레이션 SQL 내장과 sp-migrate.exe 생성"
```

---

## Task 10: 운영 문서 갱신

**Files:**
- Modify: `apps/api/scripts/README-exe.txt`
- Modify: `docs/superpowers/specs/2026-07-29-exe-migration-design.md` (상태 갱신)
- Modify: `AGENTS.md` (§6 마일스톤 진행 상황)

- [ ] **Step 1: `README-exe.txt` 파일 목록에 추가**

`sp-reset-admin.exe` 설명 줄 다음에 추가한다.

```
  sp-migrate.exe        : DB 스키마 업그레이드 도구 (새 버전 배포 후 필요할 때만 사용)
```

- [ ] **Step 2: `README-exe.txt` 에 업그레이드 절차 항목 신설**

`[A] DB 백업 및 특정 시점 복구` 항목 앞에 추가한다.

```
[신규 버전으로 업그레이드하기]

    1) sp-server.exe 를 종료합니다.
    2) 새로 받은 exe 파일들로 기존 파일을 덮어씁니다.
    3) sp-server.exe 를 실행합니다.
       - 그냥 시작되면 그대로 사용하십시오. 업그레이드할 것이 없다는 뜻입니다.
       - "데이터베이스 업그레이드가 필요합니다" 안내가 나오고 종료되면 4)로 갑니다.
    4) sp-migrate.exe 를 실행합니다.
       > sp-migrate.exe
       - DB 를 backups/pre-migrate/ 에 자동 백업한 뒤 업그레이드합니다.
       - 실패하면 화면에 백업 파일 경로가 표시됩니다. 그 파일로 복구할 수 있습니다.
    5) sp-server.exe 를 다시 실행합니다.

    * backups/pre-migrate/ 의 백업은 일자별 자동 백업과 달리 자동 삭제되지 않습니다.
      디스크가 부담되면 업그레이드가 안정된 뒤 수동으로 정리하십시오.
```

- [ ] **Step 3: 설계 문서 상태 갱신**

`docs/superpowers/specs/2026-07-29-exe-migration-design.md` 헤더의 상태 줄을 바꾼다.

```markdown
- 상태: 구현 완료
```

Task 3 Step 7 에서 checksum 불일치를 발견했다면 §11 에 한 줄 추가한다.

- [ ] **Step 4: `AGENTS.md` 마일스톤 갱신**

§6 의 M4 항목에 완료된 내용을 반영한다. 아래 줄을 M4 하위 항목에 추가한다.

```markdown
   - exe 배포판 DB 마이그레이션 (`sp-migrate.exe`) 구현 완료 — `docs/superpowers/specs/2026-07-29-exe-migration-design.md`
```

- [ ] **Step 5: 최종 전체 검증**

Run: `pnpm -F @sam/api test`
Expected: PASS — 전체 통과

Run: `pnpm -r typecheck`
Expected: 3개 워크스페이스 모두 0 errors

- [ ] **Step 6: 커밋**

```bash
git add apps/api/scripts/README-exe.txt docs/superpowers/specs/2026-07-29-exe-migration-design.md AGENTS.md
git commit -m "docs(exe): sp-migrate.exe 업그레이드 절차 안내 추가"
```

---

## DB 변경 사항 보고 (AGENTS.md §7)

작업 완료 후 사용자에게 아래를 반드시 공유한다.

- **`schema.prisma` 변경 없음.** 새 마이그레이션 파일도 추가하지 않았다.
- **새 테이블이 하나 생긴다: `_prisma_migrations`.** Prisma 규약을 그대로 따른 이력 테이블이며,
  로컬 dev DB 에는 이미 존재한다. exe 배포판 DB 에는 이번 작업으로 처음 만들어진다.
- **`ensureSchema()` 의 하드코딩 DDL 130여 줄이 삭제된다.** 이제 스키마 생성은 `prisma/migrations/`
  단일 원본으로만 이뤄진다. 기존 dev DB 는 영향 없다 (이미 최신 + 이력 테이블 보유).
- **파이프라인 반영:** 로컬 개발은 기존과 같이 `pnpm -F @sam/api prisma:migrate:dev` 를 쓴다.
  exe 배포판은 `sp-server.exe`(최초 생성) / `sp-migrate.exe`(업그레이드) 로 나뉜다.
