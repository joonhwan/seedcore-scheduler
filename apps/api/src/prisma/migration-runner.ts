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
