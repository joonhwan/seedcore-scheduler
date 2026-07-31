import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  applyMigrations,
  checksumOf,
  DowngradeError,
  ensureMigrationsTable,
  hasMigrationsTable,
  isFreshDatabase,
  LegacySchemaError,
  listApplied,
  listMigrationFiles,
  listPending,
  MigrationFailedError,
  resolveMigrationsDir,
  snapshotTo,
  type RawClient,
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

  it('실제 마이그레이션 6개의 checksum 이 Prisma CLI 가 기록한 값과 같다', () => {
    // 아래 값은 로컬 dev DB(apps/api/prisma/data/app.db)의 _prisma_migrations.checksum 에
    // 정식 prisma CLI(`prisma migrate dev`)가 직접 기록해 둔 값을 그대로 옮긴 것이다.
    // 이 테스트가 지키는 것은 두 가지다.
    //
    // 1) 우리 checksumOf() 가 Prisma 와 같은 값을 만든다는 사실. 설계 문서 6절이 약속하는
    //    "나중에 정식 prisma migrate 도구로 돌아갈 여지" 가 이 등식에 걸려 있다.
    // 2) 줄바꿈이 CRLF 로 바뀌지 않았다는 사실. 파일 내용을 그대로 해시하므로, clone 환경의
    //    core.autocrlf 때문에 CRLF 로 펼쳐지면 여섯 값이 전부 달라진다 — 저장소 루트
    //    .gitattributes 의 `text eol=lf` 지정이 무너지면 여기서 빨간불이 난다.
    //
    // 마이그레이션 파일은 한 번 배포되면 내용을 수정하지 않는 것이 규칙이므로, 이 값들이
    // 바뀌었다면 그것은 실수이거나 줄바꿈 오염이다.
    const expected: Record<string, string> = {
      '20260430123641_initial':
        'b417ba67944fbeb3c439ab9c05e7bbafb2ac7cee7faf55efb9d102cd3ec1eb14',
      '20260430132204_m1_auth_lockout':
        '9adeab42ca586f48919d5879d02c9a1d4ee9e16e27d0f460f79e9dab703fdfd2',
      '20260430211000_m2b_node_history_snapshot':
        'f491594e02610e0af715388d196d0a57ee3013e52366f05acf0774d73e7153a9',
      '20260501004505_m3_node_progress':
        '4a7c652fc5a5c13686f17cdceb6c463936f3f81df3528194b9338a6f07bb8300',
      '20260714104304_add_autocomplete_term':
        '1752d00b9a2122606affd003749c5b4420f98e93f53d19f5d81f6f146b97193b',
      '20260714121735_seed_initial_autocomplete':
        '8466571644e25df03e69ca8ae5e04141b721d0fc881f95f8cd38aade892e972f',
    };

    // 새 마이그레이션이 추가돼도 이 테스트가 막지 않도록, 알고 있는 여섯 개만 대조한다.
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    const names = listMigrationFiles(dir);
    for (const [name, checksum] of Object.entries(expected)) {
      expect(names).toContain(name);
      const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      expect(checksumOf(sql), `${name} 의 checksum 이 달라졌습니다`).toBe(checksum);
    }
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

  // 이름 주의: "이력에 기록하지 않는다" 가 아니다. 실패한 마이그레이션도 finished_at 이 NULL 인
  // 미완료 행으로 이력에 남는다(아래 "finished_at 이 NULL 인 이력 행을 남긴다" 테스트가 그 행의
  // 존재를 직접 단언한다).
  // 여기서 확인하는 것은 그 행이 listApplied() 에서 "적용됨" 으로 세어지지 않는다는 것뿐이다.
  it('실패한 마이그레이션은 적용된 것으로 세지 않는다', async () => {
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

  it('실패한 문장 원문을 담는다 (문장 실행 루프 안에서 실패한 경우)', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT); THIS IS NOT SQL;'],
    ]);
    await expect(
      applyMigrations(db.client, dir, ['20260101000000_a']),
    ).rejects.toMatchObject({
      failingStatement: 'THIS IS NOT SQL',
    });
  });

  it('이력 기록(INSERT) 자체가 실패하면 실패한 문장을 담지 않는다 (그 문장은 실행된 적이 없다)', async () => {
    // 회귀 테스트: statementIndex 값만으로 "문장 루프 안에서 실패" 를 추론하면,
    // insertStartedRecord 실패는 항상 statementIndex===0 이라 마이그레이션의 첫 문장
    // (실행된 적도 없는 문장)을 실패 원인으로 잘못 지목하게 된다. 읽기전용 DB 파일, 디스크
    // 가득 참, DB 잠금 등은 sp-migrate.exe 가 실제로 겪을 법한 이력 기록 단계 실패 원인이다.
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);

    // ensureMigrationsTable() 의 CREATE TABLE IF NOT EXISTS(1번째 $executeRawUnsafe 호출)는
    // 통과시키고, 그 다음 호출(insertStartedRecord 의 INSERT, 2번째 호출)부터 실패시켜
    // insertStartedRecord 단계 실패를 재현한다.
    let callCount = 0;
    const failingClient: RawClient = {
      $executeRawUnsafe: async (sql: string) => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('강제 실패(테스트): 이력 기록 단계');
        }
        return db.client.$executeRawUnsafe(sql);
      },
      $queryRawUnsafe: <T = unknown>(sql: string) => db.client.$queryRawUnsafe<T>(sql),
    };

    await expect(
      applyMigrations(failingClient, dir, ['20260101000000_a']),
    ).rejects.toMatchObject({
      migrationName: '20260101000000_a',
      statementIndex: 1,
      failingStatement: undefined,
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

  it('실패한 마이그레이션은 finished_at 이 NULL 인 이력 행을 남긴다 (시도했지만 중단됨 vs 아예 시도 안 함)', async () => {
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT); THIS IS NOT SQL;'],
    ]);
    await expect(
      applyMigrations(db.client, dir, ['20260101000000_a']),
    ).rejects.toThrow(MigrationFailedError);

    // listApplied() 는 finished_at IS NOT NULL 로 걸러내므로 빈 배열이어야 한다 (기존 동작 유지).
    expect(await listApplied(db.client)).toEqual([]);

    // 하지만 이력 테이블에는 시도했다는 행 자체는 남아 있어야 하고, finished_at 은 NULL 이어야 한다.
    const rows = await db.client.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: string | null }>
    >(
      `SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = '20260101000000_a'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finished_at).toBeNull();
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

    // 파일이 존재하고 크기가 0 보다 크다는 것만으로는 "데이터가 담겼다" 를 증명하지 못한다.
    // 별도 PrismaClient 로 스냅샷 파일을 직접 열어 데이터를 읽어본다.
    const snapClient = new PrismaClient({
      datasources: { db: { url: `file:${dest.replace(/\\/g, '/')}?connection_limit=1` } },
    });
    try {
      await snapClient.$connect();
      const rows = await snapClient.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM "t"',
      );
      expect(rows).toEqual([{ id: 'v1' }]);
    } finally {
      await snapClient.$disconnect();
    }
  });

  it("경로에 작은따옴표가 있어도 동작한다", async () => {
    await db.client.$executeRawUnsafe('CREATE TABLE "t" ("id" TEXT)');
    const dest = path.join(path.dirname(db.dbPath), "it's snap.db");
    await snapshotTo(db.client, dest);
    expect(fs.existsSync(dest)).toBe(true);
  });
});

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

  it('중간에 실제 데이터가 있어도 이후 RedefineTables 마이그레이션에서 데이터가 보존된다', async () => {
    // 앞의 통합 테스트들은 전부 빈 DB 에 적용하기 때문에, RedefineTables 마이그레이션의
    // "INSERT INTO new_x ... SELECT ... FROM x" 문장이 언제나 0행을 복사한다. 이 테스트는
    // 그 데이터 복사 경로가 실제로 동작해서 테이블 재생성(rebuild) 후에도 기존 행이
    // (schedule_nodes, node_comments 모두) 살아남는지를 검증한다.
    //
    // 주의: 이 테스트는 커넥션 풀 관련 회귀(PRAGMA foreign_keys=OFF 가 다른 커넥션에서
    // 무력화되는 문제, 즉 이 파일의 applyMigrations() docstring 과 test-helpers.ts 의
    // connection_limit=1 주석이 설명하는 위험)를 검증하지 않는다. 실제로 test-helpers.ts 에서
    // connection_limit=1 을 제거하고 이 테스트만 단독 실행해봤는데, 여전히 통과했다 — 이
    // Prisma/SQLite 커넥터가 순차(비동시) 실행에서는 유휴 커넥션을 재사용하는 것으로 보인다.
    // 즉 단일 커넥션 고정은 이 테스트 스위트 어디서도 증명되지 않는 방어적 불변식이고,
    // connection_limit=1 을 지워도 이 테스트는 빨간불이 되지 않는다. 그 회귀를 실제로
    // 재현하려면 동시 쿼리를 강제로 발생시키는 별도 테스트가 필요하다.
    const dir = path.resolve(__dirname, '../../prisma/migrations');
    const allNames = listMigrationFiles(dir);
    // 1번째(initial), 2번째(m1_auth_lockout) 까지만 먼저 적용해 실제 스키마에 데이터를 채운다.
    const firstTwo = allNames.slice(0, 2);
    const rest = allNames.slice(2);
    expect(rest.length).toBeGreaterThan(0);

    await applyMigrations(db.client, dir, firstTwo);

    const userId = 'u1';
    const projectId = 'p1';
    const nodeId = 'n1';
    const commentId = 'c1';

    await db.client.$executeRawUnsafe(
      `INSERT INTO "users" ("id","username","display_name","password_hash","updated_at")
       VALUES ('${userId}','tester','Tester','hash','2026-01-01T00:00:00.000Z')`,
    );
    await db.client.$executeRawUnsafe(
      `INSERT INTO "projects" ("id","name","created_by","updated_at")
       VALUES ('${projectId}','Test Project','${userId}','2026-01-01T00:00:00.000Z')`,
    );
    await db.client.$executeRawUnsafe(
      `INSERT INTO "schedule_nodes"
         ("id","project_id","parent_id","kind","title","sort_order","depth","created_by","updated_by","updated_at")
       VALUES ('${nodeId}','${projectId}',NULL,'ITEM','Test Node',1,0,'${userId}','${userId}','2026-01-01T00:00:00.000Z')`,
    );
    await db.client.$executeRawUnsafe(
      `INSERT INTO "node_comments" ("id","node_id","author_id","body","updated_at")
       VALUES ('${commentId}','${nodeId}','${userId}','a comment','2026-01-01T00:00:00.000Z')`,
    );

    // 나머지(m2b_node_history_snapshot, m3_node_progress 등 RedefineTables 포함)를 적용한다.
    await applyMigrations(db.client, dir, rest);

    // 위 applyMigrations 호출이 실제로 나머지 마이그레이션을 실행했는지부터 확인한다.
    // (이 확인이 없으면, rest 를 건너뛰는 회귀 — 예: names 순회의 off-by-one, 혹은
    // "이미 _prisma_migrations 행이 있으니 건너뛴다" 는 식의 잘못된 조기 continue —
    // 가 있어도 아래의 데이터 보존 단언들은 애초에 INSERT 직후부터 참이었으므로
    // 테스트가 초록불로 통과해버린다. progress 컬럼은 m3_node_progress 가 실행돼야만
    // 생기므로, rest 가 실제로 적용됐다는 직접적인 증거가 된다.)
    const scheduleNodeCols = await db.client.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info('schedule_nodes')`,
    );
    expect(scheduleNodeCols.map((c) => c.name)).toContain('progress');

    const nodes = await db.client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "schedule_nodes" WHERE id = '${nodeId}'`,
    );
    expect(nodes).toEqual([{ id: nodeId }]);

    // RedefineTables 는 DROP TABLE 로 재생성하므로, FK 제어(PRAGMA foreign_keys=OFF)가
    // 제대로 걸리지 않으면 이 행이 ON DELETE CASCADE 로 조용히 사라질 수 있다.
    // (다만 이 단언 자체가 커넥션 풀 회귀를 잡아낸다는 뜻은 아니다 — 위 주석 참고.)
    const comments = await db.client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "node_comments" WHERE id = '${commentId}'`,
    );
    expect(comments).toEqual([{ id: commentId }]);

    const fkViolations = await db.client.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
    expect(fkViolations).toEqual([]);

    const fkStatus = await db.client.$queryRawUnsafe<Array<{ foreign_keys: number }>>(
      'PRAGMA foreign_keys',
    );
    expect(Number(fkStatus[0]!.foreign_keys)).toBe(1);
  });
});

describe('resolveMigrationsDir', () => {
  it('로컬 개발 환경에서 실제 마이그레이션 디렉터리를 찾는다', () => {
    const dir = resolveMigrationsDir();
    expect(fs.existsSync(path.join(dir, 'migration_lock.toml'))).toBe(true);
  });
});
