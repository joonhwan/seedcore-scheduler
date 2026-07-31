import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { bindPrismaQueryEngine, resolveDatabaseUrl } from './common/db-path';
import {
  DowngradeError,
  LegacySchemaError,
  MigrationFailedError,
  applyMigrations,
  isFreshDatabase,
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

/**
 * datasource URL 에 connection_limit=1 을 붙인다.
 *
 * PRAGMA(foreign_keys=OFF, defer_foreign_keys 등)는 커넥션 단위로 적용되는데, 마이그레이션
 * 적용에 쓰는 $executeRawUnsafe 는 매번 Prisma 커넥션 풀에서 커넥션을 꺼내 쓴다. 풀에
 * 커넥션이 둘 이상이면 마이그레이션 SQL 안의 "PRAGMA foreign_keys=OFF" 문장과 뒤따르는
 * "DROP TABLE" 문장이 서로 다른 커넥션에서 실행될 수 있고, 그러면 FK 가 여전히 켜진 채로
 * DROP TABLE 의 암묵적 DELETE 가 실행되어 ON DELETE CASCADE 가 발동, node_comments /
 * node_history 같은 자식 레코드가 조용히 삭제된다 — 마이그레이션 자체는 "성공"으로 보고된다.
 * 단일 커넥션으로 고정해 이 경로를 원천적으로 막는다.
 * (apps/api/src/prisma/test-helpers.ts 의 createTempDb() 와 같은 이유, 같은 처리.)
 */
function withSingleConnection(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=1`;
}

/** exit code 를 돌려준다. process.exit 은 호출자가 부른다. */
export async function runMigrate(): Promise<number> {
  // process.env.DATABASE_URL 에는 순수한 값만 넣는다. resolveDbFilePath() 는 'file:' 접두어만
  // 벗기고 쿼리스트링은 벗기지 않으므로, 여기에 connection_limit=1 이 섞인 값을 넣으면
  // resolveDbFilePath() 를 쓰는 다른 코드가 '...?connection_limit=1' 로 끝나는 잘못된 경로를
  // 돌려주게 된다. 커넥션 고정 값은 아래에서 PrismaClient 생성자에만 별도로 넘긴다.
  const dbUrl = resolveDatabaseUrl();
  process.env.DATABASE_URL = dbUrl;
  bindPrismaQueryEngine();

  const dir = resolveMigrationsDir();
  const client = new PrismaClient({
    datasources: { db: { url: withSingleConnection(dbUrl) } },
  });

  try {
    await client.$connect();
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;');

    // "DB 가 없다" 를 fs.existsSync(경로 문자열) 로 판단하지 않는다. apps/api/.env 의
    // DATABASE_URL 은 상대경로("file:./data/app.db")일 수 있는데, Node 는 이를
    // process.cwd() 기준으로 해석하고 Prisma 는 schema.prisma 파일 위치 기준으로 해석해
    // 서로 다른 파일을 가리킬 수 있다 (실행 파일에서는 절대경로라 문제 없지만, 개발 환경
    // 검증 시에는 "파일이 없다" 는 오탐이 난다). 대신 실제로 연결한 뒤 테이블이 하나도
    // 없는지로 판단한다 — Prisma 가 연결 과정에서 빈 DB 파일을 만드는 부작용이 있어도
    // 무해하다. sp-server.exe 가 그 빈 DB 를 보고 정상적으로 초기화할 것이기 때문이다.
    if (await isFreshDatabase(client)) {
      console.error('데이터베이스가 비어 있습니다 (테이블이 하나도 없습니다).');
      console.error(
        '먼저 sp-server.exe 를 실행하면 데이터베이스가 자동으로 만들어지고 초기화됩니다.',
      );
      return 1;
    }

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
