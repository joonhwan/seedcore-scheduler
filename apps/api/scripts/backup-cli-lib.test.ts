import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkDatabaseLocks,
  collectBackupEntries,
  copyDatabaseWithSidecars,
  formatBackupBlockedNotice,
  formatBackupList,
  formatRestoreBlockedNotice,
  formatTimestamp,
  isProcessAlive,
  LOCK_FILE_NAMES,
  readLockPid,
  resolveBackupPath,
  restoreDatabaseFile,
} from './backup-cli-lib';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sam-backup-cli-'));
}

function write(file: string, contents: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, 'utf-8');
  return file;
}

describe('formatTimestamp', () => {
  it('0 을 채운 YYYYMMDD_HHMMSS 형식으로 만든다', () => {
    expect(formatTimestamp(new Date(2026, 6, 3, 4, 5, 6))).toBe('20260703_040506');
  });
});

describe('collectBackupEntries', () => {
  it('하위 pre-migrate/ 의 스냅샷도 목록에 넣는다 (예전에는 통째로 빠져 있었다)', () => {
    const dir = tmpDir();
    write(path.join(dir, 'sam_20260101_000000.db'), 'manual');
    write(path.join(dir, 'pre-migrate', 'sam_20260202_000000.db'), 'premigrate');

    const entries = collectBackupEntries(dir);

    expect(entries.map((e) => e.ref)).toEqual([
      'pre-migrate/sam_20260202_000000.db',
      'sam_20260101_000000.db',
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['pre-migrate', 'manual']);
  });

  it('복구 전 자동 저장 파일을 수동 백업과 구분한다', () => {
    const dir = tmpDir();
    write(path.join(dir, 'sam_20260101_000000.db'), 'manual');
    write(path.join(dir, 'sam_before_restore_20260101_010000.db'), 'safety');

    const kinds = Object.fromEntries(collectBackupEntries(dir).map((e) => [e.ref, e.kind]));

    expect(kinds['sam_20260101_000000.db']).toBe('manual');
    expect(kinds['sam_before_restore_20260101_010000.db']).toBe('safety');
  });

  it('.db 가 아닌 파일(-wal 사이드카 포함)은 목록에 넣지 않는다', () => {
    const dir = tmpDir();
    write(path.join(dir, 'sam_20260101_000000.db'), 'db');
    write(path.join(dir, 'sam_20260101_000000.db-wal'), 'wal');
    write(path.join(dir, 'notes.txt'), 'txt');

    expect(collectBackupEntries(dir).map((e) => e.ref)).toEqual(['sam_20260101_000000.db']);
  });

  it('같은 종류 안에서는 최신 파일이 위로 온다', () => {
    const dir = tmpDir();
    write(path.join(dir, 'sam_20260101_000000.db'), 'old');
    write(path.join(dir, 'sam_20260301_000000.db'), 'new');

    expect(collectBackupEntries(dir).map((e) => e.ref)).toEqual([
      'sam_20260301_000000.db',
      'sam_20260101_000000.db',
    ]);
  });

  it('제한 깊이보다 깊은 폴더는 훑지 않는다', () => {
    const dir = tmpDir();
    write(path.join(dir, 'a', 'b', 'c', 'deep.db'), 'deep');

    expect(collectBackupEntries(dir, 2)).toEqual([]);
  });

  it('디렉터리가 없으면 빈 목록을 돌려준다 (예외를 던지지 않는다)', () => {
    expect(collectBackupEntries(path.join(tmpDir(), 'nope'))).toEqual([]);
  });
});

describe('formatBackupList', () => {
  it('종류별 소제목과 함께 pre-migrate 스냅샷을 그대로 실은 restore 예시를 보여준다', () => {
    const dir = tmpDir();
    write(path.join(dir, 'sam_20260101_000000.db'), 'manual');
    write(path.join(dir, 'pre-migrate', 'sam_20260202_000000.db'), 'premigrate');

    const out = formatBackupList(dir, collectBackupEntries(dir));

    expect(out).toContain('업그레이드 직전 백업');
    expect(out).toContain('pre-migrate/sam_20260202_000000.db');
    expect(out).toContain('> sp-backup.exe restore pre-migrate/sam_20260202_000000.db');
  });

  it('파일이 없으면 없다고 말한다', () => {
    expect(formatBackupList('D:/backups', [])).toContain('저장된 백업 파일이 없습니다');
  });
});

describe('resolveBackupPath', () => {
  it('list 가 보여준 하위 폴더 이름을 그대로 받아 준다 (슬래시/역슬래시 모두)', () => {
    const dir = tmpDir();
    const target = write(path.join(dir, 'pre-migrate', 'sam_1.db'), 'x');

    expect(resolveBackupPath(dir, 'pre-migrate/sam_1.db')).toBe(target);
    expect(resolveBackupPath(dir, 'pre-migrate\\sam_1.db')).toBe(target);
  });

  it('확장자를 빼고 넘겨도 찾는다', () => {
    const dir = tmpDir();
    const target = write(path.join(dir, 'sam_1.db'), 'x');

    expect(resolveBackupPath(dir, 'sam_1')).toBe(target);
  });

  it('절대 경로도 받아 준다', () => {
    const dir = tmpDir();
    const target = write(path.join(dir, 'sam_1.db'), 'x');

    expect(resolveBackupPath(path.join(dir, 'other'), target)).toBe(target);
  });

  it('없으면 undefined', () => {
    expect(resolveBackupPath(tmpDir(), 'sam_missing.db')).toBeUndefined();
  });
});

describe('copyDatabaseWithSidecars', () => {
  it('-wal 이 있으면 함께 복사한다 (WAL 에만 있는 최근 커밋이 빠지지 않게)', () => {
    const dir = tmpDir();
    const src = write(path.join(dir, 'sam.db'), 'main');
    write(`${src}-wal`, 'wal-frames');

    const copied = copyDatabaseWithSidecars(src, path.join(dir, 'copy.db'));

    expect(copied).toEqual([path.join(dir, 'copy.db'), path.join(dir, 'copy.db-wal')]);
    expect(fs.readFileSync(path.join(dir, 'copy.db-wal'), 'utf-8')).toBe('wal-frames');
  });

  it('-wal 이 없으면 .db 만 복사한다', () => {
    const dir = tmpDir();
    const src = write(path.join(dir, 'sam.db'), 'main');

    expect(copyDatabaseWithSidecars(src, path.join(dir, 'copy.db'))).toEqual([
      path.join(dir, 'copy.db'),
    ]);
    expect(fs.existsSync(path.join(dir, 'copy.db-wal'))).toBe(false);
  });
});

describe('restoreDatabaseFile', () => {
  it('사이드카가 없는 스냅샷을 되돌릴 때 대상의 -wal/-shm 을 지운다', () => {
    const dir = tmpDir();
    const backup = write(path.join(dir, 'snapshot.db'), 'snapshot');
    const db = write(path.join(dir, 'data', 'sam.db'), 'current');
    write(`${db}-wal`, 'stale-wal');
    write(`${db}-shm`, 'stale-shm');

    const result = restoreDatabaseFile(backup, db);

    expect(fs.readFileSync(db, 'utf-8')).toBe('snapshot');
    expect(fs.existsSync(`${db}-wal`)).toBe(false);
    expect(fs.existsSync(`${db}-shm`)).toBe(false);
    expect(result.removed).toEqual([`${db}-wal`, `${db}-shm`]);
  });

  it('백업에 딸린 -wal 은 짝을 맞춰 함께 되돌린다', () => {
    const dir = tmpDir();
    const backup = write(path.join(dir, 'safety.db'), 'safety');
    write(`${backup}-wal`, 'safety-wal');
    const db = write(path.join(dir, 'data', 'sam.db'), 'current');
    write(`${db}-wal`, 'stale-wal');

    const result = restoreDatabaseFile(backup, db);

    expect(fs.readFileSync(db, 'utf-8')).toBe('safety');
    expect(fs.readFileSync(`${db}-wal`, 'utf-8')).toBe('safety-wal');
    expect(result.written).toEqual([db, `${db}-wal`]);
  });

  it('대상 사이드카가 없어도 그냥 복구한다', () => {
    const dir = tmpDir();
    const backup = write(path.join(dir, 'snapshot.db'), 'snapshot');
    const db = path.join(dir, 'data', 'sam.db');
    fs.mkdirSync(path.dirname(db), { recursive: true });

    const result = restoreDatabaseFile(backup, db);

    expect(result.removed).toEqual([]);
    expect(fs.readFileSync(db, 'utf-8')).toBe('snapshot');
  });
});

describe('readLockPid', () => {
  it('첫 줄의 PID 를 읽는다', () => {
    const dir = tmpDir();
    const lock = write(path.join(dir, 'sp-server.lock'), '4321\nstarted_at=2026-07-31T00:00:00Z\n');

    expect(readLockPid(lock)).toBe(4321);
  });

  it('파일이 없거나 내용이 깨졌으면 undefined', () => {
    const dir = tmpDir();

    expect(readLockPid(path.join(dir, 'none.lock'))).toBeUndefined();
    expect(readLockPid(write(path.join(dir, 'junk.lock'), 'not-a-pid\n'))).toBeUndefined();
    expect(readLockPid(write(path.join(dir, 'zero.lock'), '0\n'))).toBeUndefined();
  });
});

describe('isProcessAlive', () => {
  it('자기 자신은 살아 있다', () => {
    expect(isProcessAlive(process.pid).alive).toBe(true);
  });

  it('존재하지 않는 PID 는 죽은 것으로 본다', () => {
    // 사용 가능한 최대 PID 를 넘어서는 값이라 어느 OS 에서도 존재하지 않는다.
    expect(isProcessAlive(0x7ffffffe).alive).toBe(false);
  });
});

describe('checkDatabaseLocks', () => {
  it('살아 있는 PID 가 적힌 서버 잠금이 있으면 잠긴 것으로 본다', () => {
    const dir = tmpDir();
    const lock = write(path.join(dir, LOCK_FILE_NAMES.server), `${process.pid}\n`);

    const check = checkDatabaseLocks(dir);

    expect(check).toMatchObject({ kind: 'locked', role: 'server', pid: process.pid, lockPath: lock });
  });

  it('마이그레이션 잠금도 본다', () => {
    const dir = tmpDir();
    write(path.join(dir, LOCK_FILE_NAMES.migrate), `${process.pid}\n`);

    expect(checkDatabaseLocks(dir)).toMatchObject({ kind: 'locked', role: 'migrate' });
  });

  it('죽은 PID 가 적힌 낡은 잠금은 막지 않는다 (탈출구 유지)', () => {
    const dir = tmpDir();
    write(path.join(dir, LOCK_FILE_NAMES.server), '2147483646\n');

    expect(checkDatabaseLocks(dir)).toEqual({ kind: 'free' });
  });

  it('잠금 파일이 없으면 free', () => {
    expect(checkDatabaseLocks(tmpDir())).toEqual({ kind: 'free' });
  });
});

describe('formatRestoreBlockedNotice', () => {
  it('종료할 실행 파일과 지울 잠금 파일 경로를 함께 알려준다', () => {
    const out = formatRestoreBlockedNotice({
      role: 'server',
      pid: 1234,
      lockPath: 'D:\\app\\data\\sp-server.lock',
    });

    expect(out).toContain('sp-server.exe (PID 1234)');
    expect(out).toContain('D:\\app\\data\\sp-server.lock');
    expect(out).toContain('전혀 변경되지 않았습니다');
  });

  it('업그레이드 중일 때는 강제 종료하지 말라고 못박는다', () => {
    const out = formatRestoreBlockedNotice({
      role: 'migrate',
      pid: 99,
      lockPath: 'D:\\app\\data\\sp-migrate.lock',
      note: 'EPERM',
    });

    expect(out).toContain('강제로 종료하거나 그 창을 닫지 마십시오');
    expect(out).toContain('참고: EPERM');
  });
});

describe('formatBackupBlockedNotice', () => {
  it('서버가 켜져 있을 때는 끄지 않고 백업받는 두 가지 방법을 함께 알려준다', () => {
    const out = formatBackupBlockedNotice({
      role: 'server',
      pid: 1234,
      lockPath: 'D:\\app\\data\\sp-server.lock',
    });

    expect(out).toContain('sp-server.exe (PID 1234)');
    expect(out).toContain('데이터베이스는 전혀 변경되지 않았습니다');
    // (1) 이미 돌고 있는 자동 백업
    expect(out).toContain('data\\backup\\YYYYMMDD\\app.db.gz');
    // (2) 지금 당장 한 부 받는 관리자 API
    expect(out).toContain('POST http://<서버주소>:3000/api/v1/admin/health/backup/run');
    // 그리고 잠금 파일 탈출구
    expect(out).toContain('D:\\app\\data\\sp-server.lock');
    expect(out).toContain('sp-backup.exe backup 을 다시 실행하십시오');
  });

  it('업그레이드 중일 때는 대안을 권하지 않고 기다리라고 한다 (서버가 꺼져 있어 쓸 수 없다)', () => {
    const out = formatBackupBlockedNotice({
      role: 'migrate',
      pid: 99,
      lockPath: 'D:\\app\\data\\sp-migrate.lock',
    });

    expect(out).toContain('sp-migrate.exe (PID 99)');
    expect(out).toContain('강제로 종료하거나 그 창을 닫지 마십시오');
    expect(out).not.toContain('admin/health/backup/run');
  });
});
