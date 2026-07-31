import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decideMigrate } from './migrate-decision';
import { applyMigrations, ensureMigrationsTable } from './migration-runner';
import { createTempDb, type TempDb } from './test-helpers';

const DB_URL = 'file:./data/app.db';

function createMigrationsDir(entries: Array<[string, string]>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-decision-'));
  for (const [name, sql] of entries) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'migration.sql'), sql, 'utf8');
  }
  return dir;
}

describe('decideMigrate', () => {
  let db: TempDb;

  beforeEach(async () => {
    db = await createTempDb();
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it('진짜 빈 DB(이력도 테이블도 없음) 면 exit 2 로 멈추고 sp-server.exe 를 안내한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    const decision = await decideMigrate(db.client, dir, DB_URL);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(2);
    expect(decision.notice).toContain('sp-server.exe');
    expect(decision.notice).toContain(DB_URL);
  });

  it('최신이면 up-to-date 를 돌려준다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);
    expect(await decideMigrate(db.client, dir, DB_URL)).toEqual({ kind: 'up-to-date' });
  });

  it('미적용분이 있으면 적용할 이름 목록을 돌려준다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await applyMigrations(db.client, dir, ['20260101000000_a']);

    fs.mkdirSync(path.join(dir, '20260102000000_b'));
    fs.writeFileSync(
      path.join(dir, '20260102000000_b', 'migration.sql'),
      'ALTER TABLE "t" ADD COLUMN "x" TEXT;',
      'utf8',
    );

    const decision = await decideMigrate(db.client, dir, DB_URL);
    expect(decision).toEqual({ kind: 'apply', names: ['20260102000000_b'] });
  });

  it('레거시 DB 면 exit 4 로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'SELECT 1;']]);
    await db.client.$executeRawUnsafe('CREATE TABLE "users" ("id" TEXT PRIMARY KEY)');

    const decision = await decideMigrate(db.client, dir, DB_URL);
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

    const decision = await decideMigrate(db.client, dir, DB_URL);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(5);
    expect(decision.notice).toContain('20260901120000_future');
  });

  it('migrations 디렉터리가 비어 있으면 exit 6 으로 멈추라고 한다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-decision-empty-'));

    const decision = await decideMigrate(db.client, dir, DB_URL);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(6);
    expect(decision.notice).toContain('설치가 손상되었습니다');
  });

  it('이력은 전부 적용됐는데 테이블이 없으면(손상된 복원) exit 6 으로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('z','c','20260101000000_a',CURRENT_TIMESTAMP,1)`,
    );
    // 마이그레이션 이력은 있지만 실제 "t" 테이블은 만들지 않은 상태를 그대로 재현한다
    // (백업 오복원 등으로 이력만 남고 테이블이 사라진 시나리오). sp-server.exe 의
    // exit 6(formatSchemaMissingNotice) 과 같은 상태이므로 같은 코드/문구를 써야 한다 —
    // fresh 판정에 이력 유무(listApplied)까지 함께 봐야 empty-DB 케이스와 구분된다.

    const decision = await decideMigrate(db.client, dir, DB_URL);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(6);
    expect(decision.notice).toContain('테이블은 하나도 없습니다');
  });
});
