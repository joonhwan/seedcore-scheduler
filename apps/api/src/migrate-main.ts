import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { bindPrismaQueryEngine, resolveDatabaseUrl, resolveDbFilePath } from './common/db-path';
import {
  MigrationFailedError,
  applyMigrations,
  resolveMigrationsDir,
  snapshotTo,
} from './prisma/migration-runner';
import { decideMigrate } from './prisma/migrate-decision';
import {
  formatBackupFailedNotice,
  formatMigrateFailureNotice,
  formatNoMigrationFilesNotice,
} from './prisma/migration-messages';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 업그레이드 직전 스냅샷 경로.
 * 일상 자동 백업(BackupService, 기본 보존 30일 = BACKUP_RETENTION_DAYS)의 정리 대상과
 * 섞이지 않도록 pre-migrate/ 로 분리한다. cleanupOld() 는 8자리 숫자(YYYYMMDD) 이름의
 * 폴더만 정리 대상으로 보므로, pre-migrate/ 는 이름 자체가 그 패턴에 걸리지 않아
 * 애초에 정리 대상으로 스캔되지도 않는다.
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
 *
 * export 하는 이유: process.env.DATABASE_URL 에는 이 값이 절대 섞이면 안 된다(아래 runMigrate()
 * 참고) — 향후 실수로 그 경계가 무너지지 않도록 이 함수 자체와 양쪽 분기를 테스트로 고정한다.
 */
export function withSingleConnection(url: string): string {
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

  let dir: string;
  try {
    dir = resolveMigrationsDir();
  } catch {
    // 실행 파일에 내장되어야 할 migrations 디렉터리 자체가 없다 — 설치가 손상된 상태다.
    // DB 상태와 무관한 문제라 연결할 필요조차 없다. 이 catch 가 없으면 require.main 가드의
    // 바깥쪽 catch 로 새어나가 관리자에게 원문 스택 트레이스가 그대로 노출된다.
    console.error(formatNoMigrationFilesNotice());
    return 6;
  }

  const client = new PrismaClient({
    datasources: { db: { url: withSingleConnection(dbUrl) } },
  });

  try {
    await client.$connect();
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;');

    // dbUrl 을 항상 먼저 보여준다. resolveDbFilePath() 와 달리 Prisma 에게 그대로 넘긴 값이라
    // 상대경로("file:./data/app.db")인 경우에도 Node/Prisma 해석 차이로 인한 오해가 없다.
    // 실행 파일이 설치 폴더가 아닌 다른 작업 디렉터리에서 실행돼 엉뚱한 빈 DB 를 새로 만드는
    // 사고가 나더라도, 이 줄이 있으면 화면에 어떤 파일을 열었는지가 항상 남는다.
    console.log(`DB: ${dbUrl}`);
    console.log('');

    const decision = await decideMigrate(client, dir, dbUrl);

    if (decision.kind === 'halt') {
      console.error(decision.notice);
      return decision.exitCode;
    }

    if (decision.kind === 'up-to-date') {
      console.log('데이터베이스는 이미 최신입니다. 할 일이 없습니다.');
      return 0;
    }

    const pending = decision.names;
    console.log(`적용할 변경사항 ${pending.length}건:`);
    for (const name of pending) {
      console.log(`  - ${name}`);
    }
    console.log('');

    const backupPath = resolvePreMigrateBackupPath(new Date());
    console.log('업그레이드 전 백업을 만듭니다...');
    // 이 블록(폴더 생성 + VACUUM INTO)은 마이그레이션 적용을 시작하기 전이다. 여기서
    // 실패하면 DB 는 전혀 건드리지 않은 상태다 — 아래 applyMigrations() 루프의 실패(부분
    // 적용 가능성 있음, formatMigrateFailureNotice)와는 성격이 다르므로 별도 안내
    // (formatBackupFailedNotice)로 구분한다. 디스크 공간 부족/쓰기 권한 없음/동명 파일
    // 존재가 실제 발생 원인이다.
    try {
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      await snapshotTo(client, backupPath);
    } catch (err) {
      const causeMessage = err instanceof Error ? err.message : String(err);
      console.error('');
      console.error(formatBackupFailedNotice(backupPath, causeMessage));
      return 1;
    }
    console.log(`  백업 완료: ${backupPath}`);
    console.log('');

    // 실패 시 관리자에게 "어디까지 적용됐는지" 를 알려주려면 실행 중 직접 추적해야 한다 —
    // 한 번에 하나씩 적용하므로 이 배열의 앞부분은 이미 커밋되어 있다.
    const succeeded: string[] = [];
    try {
      for (const name of pending) {
        console.log(`적용 중: ${name}`);
        await applyMigrations(client, dir, [name]);
        succeeded.push(name);
      }
    } catch (err) {
      if (err instanceof MigrationFailedError) {
        const causeMessage = err.cause instanceof Error ? err.cause.message : String(err.cause);
        console.error('');
        console.error(
          formatMigrateFailureNotice({
            migrationName: err.migrationName,
            statementIndex: err.statementIndex,
            causeMessage,
            failingStatement: err.failingStatement,
            succeeded,
            backupPath,
            dbPath: resolveDbFilePath(),
          }),
        );
        return 1;
      }
      throw err;
    }

    console.log('');
    console.log('====================================================');
    console.log(`  업그레이드 완료 — ${pending.length}건 적용`);
    console.log('====================================================');
    console.log('');
    console.log(`  DB: ${dbUrl}`);
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
