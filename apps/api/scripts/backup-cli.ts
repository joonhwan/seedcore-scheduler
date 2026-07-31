import * as fs from 'fs';
import * as path from 'path';
import {
  checkDatabaseLocks,
  collectBackupEntries,
  copyDatabaseWithSidecars,
  formatBackupBlockedNotice,
  formatBackupList,
  formatRestoreBlockedNotice,
  formatTimestamp,
  resolveBackupPath,
  restoreDatabaseFile,
  SAFETY_PREFIX,
} from './backup-cli-lib';

/** 다른 프로그램이 DB 를 쓰고 있어 아무 것도 하지 않고 멈춘 경우. sp-server/sp-migrate 와 같은 뜻. */
const EXIT_LOCKED = 7;

function getDbPath(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    const raw = process.env.DATABASE_URL.slice('file:'.length);
    // '?connection_limit=1' 같은 쿼리스트링이 붙어 있으면 파일 이름이 오염된다.
    // (src/common/process-lock.ts 의 resolveLockPath() 와 같은 이유의 방어다.)
    const queryIndex = raw.indexOf('?');
    const pure = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
    return path.resolve(process.cwd(), pure);
  }
  return path.join(process.cwd(), 'data', 'sam.db');
}

function getBackupDir(): string {
  const dir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function runBackup() {
  const dbPath = getDbPath();

  // 서버가 켜져 있으면 백업하지 않는다. `.db` 와 `-wal` 을 연달아 복사하는 사이에 서버가
  // 체크포인트를 돌리면 두 파일의 짝이 어긋나, 복구할 때가 되어서야 쓸 수 없다는 것을 알게
  // 되는 백업이 만들어진다 (formatBackupBlockedNotice() 주석에 전모가 있다).
  // 어떤 파일도 만들기 전에 판정해야 "아무 것도 하지 않았다" 가 사실이 된다.
  const lock = checkDatabaseLocks(path.dirname(dbPath));
  if (lock.kind === 'locked') {
    console.error(
      formatBackupBlockedNotice(
        lock.note === undefined
          ? { role: lock.role, pid: lock.pid, lockPath: lock.lockPath }
          : { role: lock.role, pid: lock.pid, lockPath: lock.lockPath, note: lock.note },
      ),
    );
    process.exit(EXIT_LOCKED);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ DB 파일이 존재하지 않습니다: ${dbPath}`);
    process.exit(1);
  }

  const backupDir = getBackupDir();
  const timestamp = formatTimestamp(new Date());
  const backupFileName = `sam_${timestamp}.db`;
  const targetPath = path.join(backupDir, backupFileName);

  // WAL 모드라 최근 커밋이 아직 `-wal` 에만 있을 수 있다. `.db` 만 복사하면 그 몇 건이
  // 빠진 사본이 만들어지고, 나중에 그걸로 복구하면 조용히 옛날 상태로 돌아간다.
  const copied = copyDatabaseWithSidecars(dbPath, targetPath);
  console.log(`✅ DB 백업 성공!`);
  console.log(`   - 백업 파일: ${targetPath}`);
  if (copied.length > 1) {
    console.log(`   - 함께 저장된 파일: ${copied.slice(1).join(', ')}`);
    console.log(`     (복구할 때 자동으로 함께 되돌아갑니다. 지우지 마십시오.)`);
  }
}

function runList() {
  const backupDir = getBackupDir();
  const entries = collectBackupEntries(backupDir);
  console.log(formatBackupList(backupDir, entries));
}

function runRestore(targetFileName?: string) {
  if (!targetFileName) {
    console.error('❌ 복구할 백업 파일명을 입력해 주세요.');
    console.error('   사용법: sp-backup.exe restore sam_20260723_120000.db');
    console.error('   업그레이드 직전 백업은 폴더 이름까지 함께 넘기십시오:');
    console.error('           sp-backup.exe restore pre-migrate/sam_20260723_120000.db');
    console.error('   목록은 sp-backup.exe list 로 확인할 수 있습니다.');
    process.exit(1);
  }

  const backupDir = getBackupDir();
  const backupPath = resolveBackupPath(backupDir, targetFileName);

  if (backupPath === undefined) {
    console.error(`❌ 지정한 백업 파일을 찾을 수 없습니다: ${targetFileName}`);
    console.error(`   찾아본 위치: ${backupDir}`);
    console.error('   sp-backup.exe list 로 실제 파일 이름을 확인하십시오.');
    process.exit(1);
  }

  const dbPath = getDbPath();
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 서버나 업그레이드가 돌고 있으면 손대지 않는다. DB 파일을 통째로 바꿔치는 작업이라,
  // 그 파일을 열어 둔 프로세스가 있으면 복구한 내용이 그대로 덮어써지거나 파일이 깨진다.
  // 어떤 파일도 만들거나 지우기 전에 판정해야 "전혀 변경되지 않았습니다" 가 사실이 된다.
  const lock = checkDatabaseLocks(dataDir);
  if (lock.kind === 'locked') {
    console.error(
      formatRestoreBlockedNotice(
        lock.note === undefined
          ? { role: lock.role, pid: lock.pid, lockPath: lock.lockPath }
          : { role: lock.role, pid: lock.pid, lockPath: lock.lockPath, note: lock.note },
      ),
    );
    process.exit(EXIT_LOCKED);
  }

  // 복구 전 현재 DB 안전 백업 (`-wal` 까지 함께 — 그러지 않으면 최근 며칠이 아니라
  // 최근 몇 분이 빠진 사본이 되고, 정작 되돌리려 할 때 그 사실을 알게 된다)
  if (fs.existsSync(dbPath)) {
    const autoSafetyPath = path.join(backupDir, `${SAFETY_PREFIX}${formatTimestamp(new Date())}.db`);
    const savedFiles = copyDatabaseWithSidecars(dbPath, autoSafetyPath);
    console.log(`🛡️ 복구 실행 전 현재 DB 를 아래 위치에 자동 저장했습니다.`);
    for (const file of savedFiles) {
      console.log(`   - ${file}`);
    }
    console.log(`   되돌리려면: > sp-backup.exe restore ${path.basename(autoSafetyPath)}`);
  }

  const result = restoreDatabaseFile(backupPath, dbPath);
  console.log(`✅ DB 복구 성공!`);
  console.log(`   - 복구된 백업 파일: ${backupPath}`);
  console.log(`   - 데이터베이스 위치: ${dbPath}`);
  if (result.removed.length > 0) {
    // 이 삭제가 복구의 핵심이다. 남겨두면 SQLite 가 옛 DB 의 -wal 을 복구한 파일에 다시
    // 얹어, 복구가 무효가 되거나 파일이 깨진다. 관리자가 무슨 일이 있었는지 알 수 있게 찍는다.
    console.log(`   - 정리한 이전 WAL 파일: ${result.removed.join(', ')}`);
  }
  console.log(`⚠️ 서버가 구동 중인 경우 데이터 반영을 위해 sp-server.exe를 재시작해 주세요.`);
}

function printHelp() {
  console.log(`
==================================================
  🛠️ SAM Scheduler (seedcore) DB 백업/복구 CLI 도구
==================================================
사용법:
  sp-backup.exe backup          : 현재 DB를 backups/ 디렉터리에 타임스탬프 백업
  sp-backup.exe list            : 백업 디렉터리의 파일 목록 조회 (하위 pre-migrate/ 포함)
  sp-backup.exe restore <파일명> : 지정한 백업 파일로 DB 복구
                                  (list 에 보이는 이름을 폴더까지 그대로 넘기십시오)
  * backup 과 restore 는 sp-server.exe / sp-migrate.exe 를 먼저 종료해야 합니다.
    서버를 켠 채로 백업을 받으려면 서버의 자동 백업(data\\backup\\)을 쓰십시오.
종료 코드:
  0 : 정상   1 : 파일을 찾을 수 없음 등 입력 오류
  7 : sp-server.exe / sp-migrate.exe 가 실행 중이라 아무 작업도 하지 않음 (DB 변경 없음)
==================================================
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  switch (command) {
    case 'backup':
      runBackup();
      break;
    case 'list':
      runList();
      break;
    case 'restore':
      runRestore(args[1]);
      break;
    default:
      printHelp();
      break;
  }
}

main();
