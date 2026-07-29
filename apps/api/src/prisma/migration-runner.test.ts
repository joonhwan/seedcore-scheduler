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
