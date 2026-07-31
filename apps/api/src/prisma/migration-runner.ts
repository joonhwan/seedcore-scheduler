import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { splitSqlStatements } from './sql-statements';

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
 * 실패하면 즉시 중단한다. 뒤의 마이그레이션도 실행하지 않는다. (이력 기록 방식은 아래 참고)
 *
 * 중요(호출자 책임): PRAGMA foreign_keys=OFF / defer_foreign_keys 는 커넥션 단위 설정이다.
 * 이 함수가 실행하는 문장들은 매번 `client` 의 커넥션 풀에서 커넥션을 꺼내 쓰므로, 풀에
 * 커넥션이 둘 이상이면 어떤 마이그레이션(예: m3_node_progress)의 "PRAGMA foreign_keys=OFF" 문장과
 * 뒤이은 "DROP TABLE" 문장이 서로 다른 커넥션에서 실행될 수 있다. 그러면 FK 가 여전히 켜진
 * 채로 DROP TABLE 의 암묵적 DELETE 가 실행되어 ON DELETE CASCADE 가 발동하고, 관련 자식
 * 레코드(예: node_comments, node_history)가 조용히 삭제된다 — 마이그레이션은 "성공"으로 보고된다.
 * 그러므로 호출자는 반드시 datasource URL 에 `connection_limit=1` 을 붙여 단일 커넥션으로
 * 고정한 client 를 넘겨야 한다. (test-helpers.ts 의 createTempDb() 참고)
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
    const checksum = checksumOf(sql);
    const id = randomUUID();

    // Prisma 의 방식을 따른다: 실행 전에 finished_at 이 NULL 인 행을 먼저 남기고,
    // 전부 성공하면 UPDATE 로 완료 처리한다. 이렇게 하면 "시도했지만 중단됨" 과
    // "아예 시도하지 않음" 을 이력만 보고 구분할 수 있다. listApplied() 는 이미
    // finished_at IS NOT NULL 조건으로 걸러내므로, 중단된 행이 있어도 적용된 것으로
    // 잘못 세지 않는다.
    //
    // 문장 실행 실패든, 아래 이력 기록(INSERT/UPDATE) 자체의 실패든 모두 이 try 안에서
    // MigrationFailedError 로 통일해서 던진다 — 이력 기록 실패가 관리자에게 raw Prisma
    // 에러로 노출되지 않게 하기 위해서다.
    let statementIndex = 0;
    try {
      await insertStartedRecord(client, id, name, checksum);

      for (; statementIndex < statements.length; statementIndex += 1) {
        await client.$executeRawUnsafe(statements[statementIndex]!);
      }

      await markFinished(client, id, statements.length);
    } catch (err) {
      // 1-based 로 알린다. 관리자가 파일을 열어 세기 좋다.
      // insertStartedRecord 단계 실패는 statementIndex===0 → 1 로, markFinished 단계 실패는
      // statementIndex===statements.length → 문장 수 + 1 로 보고된다.
      throw new MigrationFailedError(name, statementIndex + 1, err);
    }
  }
}

async function insertStartedRecord(
  client: RawClient,
  id: string,
  name: string,
  checksum: string,
): Promise<void> {
  // VALUES 에 파라미터를 쓸 수 없는 상황이 아니지만, $executeRawUnsafe 로 일관되게 다룬다.
  // name/checksum 은 파일시스템과 해시에서 온 값이라 인용부호만 escape 하면 충분하다.
  const escapedName = name.replace(/'/g, "''");
  await client.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id","checksum","migration_name","started_at","applied_steps_count")
     VALUES ('${id}','${checksum}','${escapedName}',CURRENT_TIMESTAMP,0)`,
  );
}

async function markFinished(client: RawClient, id: string, steps: number): Promise<void> {
  await client.$executeRawUnsafe(
    `UPDATE "_prisma_migrations"
        SET finished_at = CURRENT_TIMESTAMP, applied_steps_count = ${steps}
      WHERE id = '${id}'`,
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
 *
 * 전제조건 (호출자 책임 — 둘 다 실패 시 raw Prisma 에러가 그대로 전파된다):
 * - destPath 의 부모 디렉터리가 미리 존재해야 한다. VACUUM INTO 는 디렉터리를 만들어주지
 *   않는다. 없으면 SQLITE_CANTOPEN 계열 에러가 난다.
 * - destPath 에 파일이 이미 있으면 VACUUM INTO 가 거부한다 ("output file already exists").
 *   덮어쓰기가 필요하면 호출자가 미리 지우거나, 매번 충돌하지 않는 파일명을 골라야 한다.
 */
export async function snapshotTo(client: RawClient, destPath: string): Promise<void> {
  // VACUUM INTO 는 prepared parameter 미지원 → 인라인. SQLite 는 '' 로 escape.
  const escaped = destPath.replace(/'/g, "''");
  await client.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
}
