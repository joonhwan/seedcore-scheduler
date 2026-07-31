import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { bindPrismaQueryEngine, resolveDatabaseUrl, resolveDbFilePath } from './common/db-path';
import { appendPlainLog } from './common/plain-daily-log';
import { removeLock } from './common/process-lock';
import {
  MigrationFailedError,
  applyMigrations,
  resolveMigrationsDir,
  snapshotTo,
} from './prisma/migration-runner';
import { createMigrationClient } from './prisma/migration-client';
import { decideMigrate } from './prisma/migrate-decision';
import { acquireLock } from './prisma/lock-decision';
import {
  formatBackupFailedNotice,
  formatMigrateFailureNotice,
  formatNoMigrationFilesNotice,
} from './prisma/migration-messages';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

const LOG_CONTEXT = 'sp-migrate';

/**
 * 화면과 로그 파일에 동시에 남긴다.
 *
 * sp-migrate.exe 는 Nest 를 띄우지 않아 DailyLoggerService 가 없고, 그래서 예전에는 이 도구가
 * 만드는 모든 출력(백업 경로, 실패 안내)이 콘솔에만 존재했다. 관리자가 탐색기에서 더블클릭해
 * 실행하면 종료와 함께 창이 사라지고, 그러면 복구에 필요한 백업 파일 경로를 다시 알아낼
 * 방법이 없다 — sp-backup.exe list 는 backups/pre-migrate/ 를 훑지 않는다. 설계 문서 3절이
 * "같은 안내를 로그 파일에도 기록한다" 고 요구하는 이유가 바로 이것이다.
 */
function emit(message: string): void {
  console.log(message);
  appendPlainLog('LOG', message, LOG_CONTEXT);
}

function emitError(message: string): void {
  console.error(message);
  appendPlainLog('ERROR', message, LOG_CONTEXT);
}

/**
 * 업그레이드 직전 스냅샷 경로.
 *
 * 일상 자동 백업(BackupService, 기본 보존 30일 = BACKUP_RETENTION_DAYS)의 정리 대상과 섞이지
 * 않는 이유는 두 겹이고, 실제로 지켜 주는 쪽은 첫 번째다.
 *
 * 1) 애초에 다른 트리다. BackupService.backupDir 의 기본값은 `<cwd>/data/backup`
 *    (backup.service.ts:44-48)이고, 여기서 만드는 스냅샷은 `<cwd>/backups/pre-migrate` 다.
 *    cleanupOld() 는 자기 backupDir 아래만 훑으므로 이 경로는 스캔 대상에 들어오지도 않는다.
 * 2) 이름 패턴도 걸리지 않는다. cleanupOld() 는 8자리 숫자(YYYYMMDD) 이름의 폴더만 정리
 *    대상으로 보는데 `pre-migrate` 는 그 패턴이 아니다. 이 두 번째 방어선은 누군가
 *    `BACKUP_DIR=./backups` 로 설정해 두 트리가 겹쳤을 때에만 의미가 있다.
 */
export function resolvePreMigrateBackupPath(now: Date): string {
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return path.join(process.cwd(), 'backups', 'pre-migrate', `sam_${stamp}.db`);
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
    emitError(formatNoMigrationFilesNotice());
    return 6;
  }

  const client = createMigrationClient(dbUrl);

  // 아래 finally 에서 "내가 잡은 잠금만" 해제하기 위한 표시. removeLock() 이 PID 소유권까지
  // 확인하므로 이중 방어지만, 잠금을 잡기 전에 반환/예외로 빠져나가는 경로(서버 실행 중 등)에서
  // 남의 잠금을 지우려는 시도조차 하지 않게 해 둔다.
  let heldMigrateLock = false;

  try {
    await client.$connect();
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;');

    // dbUrl 을 항상 먼저 보여준다. resolveDbFilePath() 와 달리 Prisma 에게 그대로 넘긴 값이라
    // 상대경로("file:./data/app.db")인 경우에도 Node/Prisma 해석 차이로 인한 오해가 없다.
    // 실행 파일이 설치 폴더가 아닌 다른 작업 디렉터리에서 실행돼 엉뚱한 빈 DB 를 새로 만드는
    // 사고가 나더라도, 이 줄이 있으면 화면에 어떤 파일을 열었는지가 항상 남는다.
    emit(`DB: ${dbUrl}`);
    emit('');

    const decision = await decideMigrate(client, dir, dbUrl);

    if (decision.kind === 'halt') {
      emitError(decision.notice);
      return decision.exitCode;
    }

    if (decision.kind === 'up-to-date') {
      emit('데이터베이스는 이미 최신입니다. 할 일이 없습니다.');
      return 0;
    }

    const pending = decision.names;
    emit(`적용할 변경사항 ${pending.length}건:`);
    for (const name of pending) {
      emit(`  - ${name}`);
    }
    emit('');

    // 백업보다 먼저 다른 프로세스가 DB 를 쓰고 있는지 본다. 순서가 뒤바뀌면 안 된다 — 이 안내는
    // "DB 를 전혀 건드리지 않았다" 고 약속하고, 그 약속이 사실이어야 관리자가 재설치나 복원을
    // 시도하지 않는다. (위험의 전모는 process-lock.ts 의 파일 앞머리 주석 참고: 트랜잭션을 쓰지
    // 않는 이 설계에서는 마이그레이션 문장이 하나씩 커밋되므로, INSERT SELECT 와 DROP TABLE 사이에
    // 다른 프로세스가 커밋한 사용자 편집은 사전 백업에도 없어 되돌릴 수단이 아예 없다.)
    //
    // decideMigrate() 뒤에 두는 것도 의도적이다. 적용할 것이 없는(=up-to-date) 상태에서는 서버가
    // 켜져 있는 것이 정상이며, 그때 sp-migrate.exe 는 "이미 최신입니다" 로 조용히 끝나야 한다.
    // 살아 있는 sp-server.exe 도, 겹쳐 도는 다른 sp-migrate.exe 도 막는다. 확인 → 기록 →
    // 되읽어 검증을 acquireLock() 이 한 경로로 묶고, sp-server.exe 부팅 경로와 같은 코드를 쓴다.
    // 여기서 잠금을 잡으면 아래 백업부터가 쓰기 구간이다 — 해제는 finally 에서.
    const lock = acquireLock('migrate');
    if (lock.kind === 'halt') {
      emitError('');
      emitError(lock.notice);
      return lock.exitCode;
    }
    // 잠금을 못 걸었어도 업그레이드는 진행한다(폐쇄망에서 업그레이드 자체가 막히는 편이 더 나쁘다).
    // 다만 안전장치가 꺼진 상태를 조용히 넘기지 않는다.
    if (lock.warning !== undefined) {
      emitError(lock.warning);
      emit('');
    }
    heldMigrateLock = lock.held;

    const backupPath = resolvePreMigrateBackupPath(new Date());
    emit('업그레이드 전 백업을 만듭니다...');
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
      emitError('');
      emitError(formatBackupFailedNotice(backupPath, causeMessage));
      return 1;
    }
    emit(`  백업 완료: ${backupPath}`);
    emit('');

    // 실패 시 관리자에게 "어디까지 적용됐는지" 를 알려주려면 실행 중 직접 추적해야 한다 —
    // 한 번에 하나씩 적용하므로 이 배열의 앞부분은 이미 커밋되어 있다.
    const succeeded: string[] = [];
    let currentName = pending[0]!;
    try {
      for (const name of pending) {
        currentName = name;
        emit(`적용 중: ${name}`);
        await applyMigrations(client, dir, [name]);
        succeeded.push(name);
      }
    } catch (err) {
      // MigrationFailedError 만 처리하면 안 된다. applyMigrations() 는 문장 실행 루프 "밖"에서도
      // 던진다 — ensureMigrationsTable()(migration-runner.ts:199)과 readMigrationSql()(:202)이
      // 그 자리다. 그 예외를 그대로 흘려보내면 최상위 catch 가 "예상하지 못한 오류로
      // 중단했습니다: <스택>" 만 찍고 exit 1 로 끝나는데, 그 시점에는 이미 사전 백업이
      // 만들어졌고 앞쪽 마이그레이션이 커밋되어 있을 수도 있다. README-exe.txt 는 exit 1 이
      // 항상 두 안내 중 하나를 보여준다고 약속하고, (나) 항목은 "화면에 표시된 백업 파일로
      // 복구하라" 고 안내한다 — 그 경로가 화면에 없으면 관리자는 복구 수단을 잃는다.
      //
      // 그래서 어떤 예외든 같은 안내로 수렴시킨다. formatMigrateFailureNotice() 는
      // failingStatement === undefined 를 이미 "SQL 문장이 아니라 이력 기록 단계 자체에서
      // 실패" 로 표현하고(migration-messages.ts:211), 이 두 지점(이력 테이블 생성 / 파일 읽기)
      // 역시 SQL 문장 실행이 아니므로 그 표현이 그대로 맞는다. statementIndex 는 undefined 로
      // 넘겨 "문장 번호를 특정할 수 없습니다" 로 표시하게 한다.
      const isMigrationFailure = err instanceof MigrationFailedError;
      const causeMessage = isMigrationFailure
        ? err.cause instanceof Error
          ? err.cause.message
          : String(err.cause)
        : err instanceof Error
          ? err.message
          : String(err);
      emitError('');
      emitError(
        formatMigrateFailureNotice({
          migrationName: isMigrationFailure ? err.migrationName : currentName,
          statementIndex: isMigrationFailure ? err.statementIndex : undefined,
          causeMessage,
          failingStatement: isMigrationFailure ? err.failingStatement : undefined,
          succeeded,
          backupPath,
          dbPath: resolveDbFilePath(),
        }),
      );
      return 1;
    }

    emit('');
    emit('====================================================');
    emit(`  업그레이드 완료 — ${pending.length}건 적용`);
    emit('====================================================');
    emit('');
    emit(`  DB: ${dbUrl}`);
    emit('  이제 sp-server.exe 를 실행하십시오.');
    emit('');
    return 0;
  } finally {
    // 성공/실패/예외 어느 경로로 나가든 잠금을 놓는다. 남겨두면 다음 시도와 서버 시작이 막힌다
    // (PID 생존 확인과 "잠금 파일을 지우라" 안내가 있으니 복구는 되지만, 관리자에게 불필요한
    // 사고 조사를 시키는 셈이다).
    if (heldMigrateLock) {
      removeLock('migrate');
    }
    await client.$disconnect();
  }
}

// pkg 로 만든 실행 파일의 엔트리. 테스트에서 임포트할 때는 실행되지 않아야 하므로 분리한다.
if (require.main === module) {
  runMigrate()
    .then((code) => process.exit(code))
    .catch((err) => {
      // 여기까지 오는 것은 runMigrate() 안의 어떤 분기도 예상하지 못한 경우다 (백업 실패와
      // 적용 실패는 runMigrate() 안에서 전용 안내로 처리한다). 스택까지 로그 파일에 남긴다 —
      // 콘솔 창이 닫혀버리면 이 텍스트가 유일한 단서다.
      console.error('예상하지 못한 오류로 중단했습니다:', err);
      appendPlainLog(
        'ERROR',
        `예상하지 못한 오류로 중단했습니다: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        LOG_CONTEXT,
      );
      process.exit(1);
    });
}
