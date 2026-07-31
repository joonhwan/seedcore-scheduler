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
