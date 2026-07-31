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

  it('migrations 디렉터리가 비어 있으면 exit 6 으로 멈추라고 한다', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-boot-empty-'));

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(6);
    expect(decision.notice).toContain('설치가 손상되었습니다');
  });

  it('이력은 전부 적용됐는데 테이블이 없으면 exit 6 으로 멈추라고 한다', async () => {
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('z','c','20260101000000_a',CURRENT_TIMESTAMP,1)`,
    );
    // 마이그레이션 이력은 있지만 실제 "t" 테이블은 만들지 않은 상태를 그대로 재현한다
    // (백업 오복원 등으로 이력만 남고 테이블이 사라진 시나리오).

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(6);
    expect(decision.notice).toContain('테이블은 하나도 없습니다');
  });

  it('테이블이 없고 이력만 남았는데 미적용분까지 있으면 exit 6 이다 (최초 실행으로 오진하지 않는다)', async () => {
    // 오래된 .db 를 새 .db 위에 복원한 상태. 예전에는 이 상태를 "테이블 0개 = 최초 실행" 으로
    // 보고 뒤쪽 마이그레이션만 빈 파일에 적용했다 — 첫 "INSERT INTO new_x SELECT ... FROM x"
    // 에서 죽고, 관리자는 exit 1 안내("DB 파일을 지우고 다시 실행")를 따르게 된다. 같은 상태를
    // sp-migrate.exe 는 exit 2 로 진단했으니 두 실행 파일의 진단이 어긋나 있었다.
    const dir = createMigrationsDir([
      ['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);'],
      ['20260102000000_b', 'ALTER TABLE "t" ADD COLUMN "x" TEXT;'],
    ]);
    await ensureMigrationsTable(db.client);
    await db.client.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
       VALUES ('z','c','20260101000000_a',CURRENT_TIMESTAMP,1)`,
    );

    const decision = await decideBoot(db.client, dir);
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.exitCode).toBe(6);
    expect(decision.notice).toContain('테이블은 하나도 없습니다');
  });

  it('이력 테이블만 있고 완료된 행이 없으면 여전히 최초 실행으로 본다', async () => {
    // ensureMigrationsTable() 직후 첫 INSERT 전에 프로세스가 죽으면 빈 이력 테이블만 남는다.
    // 이건 손상이 아니라 아직 아무것도 적용되지 않은 진짜 최초 실행이므로 그대로 적용해야 한다.
    // (위 판정을 "테이블 존재 여부" 로 구현하면 이 케이스가 exit 6 으로 잘못 막힌다.)
    const dir = createMigrationsDir([['20260101000000_a', 'CREATE TABLE "t" ("id" TEXT);']]);
    await ensureMigrationsTable(db.client);

    expect(await decideBoot(db.client, dir)).toEqual({
      kind: 'apply',
      names: ['20260101000000_a'],
    });
  });
});
