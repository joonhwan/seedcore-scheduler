import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  snapshotTo,
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
