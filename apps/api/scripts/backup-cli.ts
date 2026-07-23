import * as fs from 'fs';
import * as path from 'path';

function getDbPath(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    return process.env.DATABASE_URL.replace('file:', '');
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

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function runBackup() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ DB 파일이 존재하지 않습니다: ${dbPath}`);
    process.exit(1);
  }

  const backupDir = getBackupDir();
  const timestamp = formatTimestamp(new Date());
  const backupFileName = `sam_${timestamp}.db`;
  const targetPath = path.join(backupDir, backupFileName);

  fs.copyFileSync(dbPath, targetPath);
  console.log(`✅ DB 백업 성공!`);
  console.log(`   - 백업 파일: ${targetPath}`);
}

function runList() {
  const backupDir = getBackupDir();
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));

  console.log(`📁 백업 파일 목록 (${backupDir}):`);
  if (files.length === 0) {
    console.log('   (저장된 백업 파일이 없습니다.)');
    return;
  }

  files.sort().reverse();
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stat = fs.statSync(filePath);
    const sizeKb = (stat.size / 1024).toFixed(1);
    console.log(`   - ${file}  (${sizeKb} KB, ${stat.mtime.toLocaleString()})`);
  }
}

function runRestore(targetFileName?: string) {
  if (!targetFileName) {
    console.error('❌ 복구할 백업 파일명을 입력해 주세요.');
    console.error('   사용법: sp-backup.exe restore sam_20260723_120000.db');
    process.exit(1);
  }

  const backupDir = getBackupDir();
  let backupPath = path.join(backupDir, targetFileName);

  if (!fs.existsSync(backupPath) && !targetFileName.endsWith('.db')) {
    backupPath = path.join(backupDir, `${targetFileName}.db`);
  }

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ 지정한 백업 파일을 찾을 수 없습니다: ${backupPath}`);
    process.exit(1);
  }

  const dbPath = getDbPath();
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 복구 전 현재 DB 안전 백업
  if (fs.existsSync(dbPath)) {
    const autoSafetyPath = path.join(backupDir, `sam_before_restore_${formatTimestamp(new Date())}.db`);
    fs.copyFileSync(dbPath, autoSafetyPath);
    console.log(`🛡️ 복구 실행 전 현재 DB가 안전하게 자동 저장되었습니다: ${autoSafetyPath}`);
  }

  fs.copyFileSync(backupPath, dbPath);
  console.log(`✅ DB 복구 성공!`);
  console.log(`   - 복구된 백업 파일: ${backupPath}`);
  console.log(`   - 데이터베이스 위치: ${dbPath}`);
  console.log(`⚠️ 서버가 구동 중인 경우 데이터 반영을 위해 sp-server.exe를 재시작해 주세요.`);
}

function printHelp() {
  console.log(`
==================================================
  🛠️ SAM Scheduler (seedcore) DB 백업/복구 CLI 도구
==================================================
사용법:
  sp-backup.exe backup          : 현재 DB를 backups/ 디렉터리에 타임스탬프 백업
  sp-backup.exe list            : 백업 디렉터리의 파일 목록 조회
  sp-backup.exe restore <파일명> : 지정한 백업 파일로 DB 복구
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
