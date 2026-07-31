import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkLock,
  checkServerLock,
  isProcessAlive,
  readLock,
  readServerLock,
  removeLock,
  removeServerLock,
  resolveLockPath,
  resolveServerLockPath,
  writeLock,
  writeServerLock,
} from './process-lock';

// 어떤 OS 에서도 배정되지 않는 값 → process.kill(pid, 0) 이 확실히 ESRCH 를 낸다.
// (0 이나 음수는 프로세스 그룹 등 특수 의미에 걸리므로 쓰지 않는다.)
const DEAD_PID = 2 ** 30;

describe('process-lock', () => {
  // 실제 파일을 다루므로 임시 디렉터리에 DB 경로를 만들어 두고 DATABASE_URL 로 가리킨다.
  // vitest.config.ts 가 fileParallelism: false 라 cwd 가 새면 뒤에 실행되는 모든 테스트 파일이
  // 깨진다 — 임시 디렉터리를 지우기 전에 cwd 를 먼저 되돌린다.
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = process.env.DATABASE_URL;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-process-lock-'));
    fs.mkdirSync(path.join(tmpDir, 'data'));
    process.env.DATABASE_URL = `file:${path.join(tmpDir, 'data', 'app.db').replace(/\\/g, '/')}`;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolveLockPath', () => {
    it('DB 파일과 같은 폴더에 역할별 파일명으로 만든다', () => {
      const dataDir = path.join(tmpDir, 'data');
      expect(resolveLockPath('server')).toBe(path.join(dataDir, 'sp-server.lock'));
      expect(resolveLockPath('migrate')).toBe(path.join(dataDir, 'sp-migrate.lock'));
    });

    it('두 역할의 잠금 파일은 서로 다른 파일이다', () => {
      // 하나로 합치면 "무엇이 잡고 있는지" 를 구분할 수 없어 맞는 안내를 줄 수 없다.
      expect(resolveLockPath('server')).not.toBe(resolveLockPath('migrate'));
    });

    it('상대경로 DATABASE_URL 도 절대경로로 정규화한다 (안내 문구에 그대로 싣기 때문)', () => {
      process.chdir(tmpDir);
      process.env.DATABASE_URL = 'file:./data/app.db';
      expect(path.isAbsolute(resolveLockPath('server'))).toBe(true);
      expect(path.isAbsolute(resolveLockPath('migrate'))).toBe(true);
    });

    it('URL 에 쿼리스트링이 섞여도 폴더 이름이 오염되지 않는다', () => {
      const base = path.join(tmpDir, 'data', 'app.db').replace(/\\/g, '/');
      process.env.DATABASE_URL = `file:${base}?connection_limit=1`;
      expect(resolveLockPath('migrate')).toBe(path.join(tmpDir, 'data', 'sp-migrate.lock'));
    });
  });

  describe('쓰기 / 읽기 / 삭제 왕복', () => {
    it('쓴 PID 를 그대로 읽고, 지우면 다시 undefined 가 된다', () => {
      expect(readLock('server')).toBeUndefined();

      expect(writeLock('server', 12345)).toBe(true);
      expect(fs.existsSync(resolveLockPath('server'))).toBe(true);
      expect(readLock('server')).toBe(12345);

      removeLock('server', 12345);
      expect(fs.existsSync(resolveLockPath('server'))).toBe(false);
      expect(readLock('server')).toBeUndefined();
    });

    it('인자 없이 쓰면 자기 PID 를 남긴다', () => {
      writeLock('migrate');
      expect(readLock('migrate')).toBe(process.pid);
    });

    it('한 역할의 잠금은 다른 역할에 영향을 주지 않는다', () => {
      writeLock('server', 111);
      expect(readLock('migrate')).toBeUndefined();
      writeLock('migrate', 222);
      expect(readLock('server')).toBe(111);
      removeLock('migrate', 222);
      expect(readLock('server')).toBe(111);
    });

    it('DB 폴더가 아직 없어도 만들어 쓴다 (부팅 순서에 따라 없을 수 있다)', () => {
      process.env.DATABASE_URL = `file:${path.join(tmpDir, 'fresh', 'app.db').replace(/\\/g, '/')}`;
      expect(writeLock('server', 4242)).toBe(true);
      expect(readLock('server')).toBe(4242);
    });

    it('잠금 파일이 없을 때 지워도 예외를 던지지 않는다', () => {
      expect(() => removeLock('server')).not.toThrow();
    });

    it('내용이 깨진 잠금 파일은 잠금 없음으로 본다', () => {
      // PID 를 모르면 생존 판단도, 안내 문구에 실을 번호도 없다. 판단 불가 상태로 실행을
      // 영구히 막지 않는다 (process-lock.ts 의 readLock() 주석 참고).
      fs.writeFileSync(resolveLockPath('server'), 'not-a-pid\n');
      expect(readLock('server')).toBeUndefined();
      expect(checkLock('server')).toEqual({ kind: 'free' });
    });
  });

  describe('removeLock 의 소유권 확인', () => {
    it('남의 PID 가 적힌 잠금은 지우지 않는다', () => {
      // 이 방어가 없으면: 서버 B 가 A 의 잠금을 덮어쓰고 B 만 종료할 때 B 의 정리 코드가 잠금을
      // 지워버려, A 가 여전히 서비스 중인데도 sp-migrate.exe 가 "잠금 없음" 으로 보고 진행한다.
      writeLock('server', 999_001);
      removeLock('server', process.pid);
      expect(fs.existsSync(resolveLockPath('server'))).toBe(true);
      expect(readLock('server')).toBe(999_001);
    });

    it('내 PID 가 적힌 잠금만 지운다', () => {
      writeLock('migrate', process.pid);
      removeLock('migrate');
      expect(fs.existsSync(resolveLockPath('migrate'))).toBe(false);
    });

    it('내용이 깨진 잠금 파일도 지우지 않는다 (소유권을 증명할 수 없다)', () => {
      const lockPath = resolveLockPath('migrate');
      fs.writeFileSync(lockPath, 'garbage\n');
      removeLock('migrate');
      expect(fs.existsSync(lockPath)).toBe(true);
      // 남아 있어도 아무것도 막지 않는다.
      expect(checkLock('migrate')).toEqual({ kind: 'free' });
    });
  });

  describe('isProcessAlive', () => {
    it('자기 자신은 살아 있다고 본다', () => {
      expect(isProcessAlive(process.pid).alive).toBe(true);
    });

    it('존재하지 않는 PID 는 죽은 것으로 본다', () => {
      expect(isProcessAlive(DEAD_PID).alive).toBe(false);
    });
  });

  describe('checkLock', () => {
    it('살아 있는 PID 가 적혀 있으면 역할·PID·잠금 경로와 함께 locked 를 돌려준다', () => {
      writeLock('migrate', process.pid);
      const result = checkLock('migrate');
      expect(result.kind).toBe('locked');
      if (result.kind === 'locked') {
        expect(result.role).toBe('migrate');
        expect(result.pid).toBe(process.pid);
        expect(result.lockPath).toBe(resolveLockPath('migrate'));
      }
    });

    it('죽은 PID 가 적힌 낡은 잠금은 막지 않는다', () => {
      // 강제 종료나 콘솔 창 닫기로 남은 잠금이 정상적인 실행을 영구히 막으면 안 된다.
      // 이 방어선이 없으면 폐쇄망 현장에서 손쓸 방법이 사라진다.
      writeLock('server', DEAD_PID);
      writeLock('migrate', DEAD_PID);
      expect(checkLock('server')).toEqual({ kind: 'free' });
      expect(checkLock('migrate')).toEqual({ kind: 'free' });
    });

    it('잠금 파일이 아예 없으면 free 다', () => {
      expect(checkLock('server')).toEqual({ kind: 'free' });
      expect(checkLock('migrate')).toEqual({ kind: 'free' });
    });
  });

  describe('이전 이름 (server 전용 API)', () => {
    // role 파라미터가 생기기 전의 호출부/테스트가 그대로 동작해야 한다.
    it('server 역할로 위임한다', () => {
      expect(resolveServerLockPath()).toBe(resolveLockPath('server'));
      expect(writeServerLock(777)).toBe(true);
      expect(readServerLock()).toBe(777);
      removeServerLock(777);
      expect(readServerLock()).toBeUndefined();

      // 판정도 위임한다 — 살아 있는 PID 여야 'locked' 가 나온다.
      writeServerLock(process.pid);
      expect(checkServerLock().kind).toBe('locked');
      removeServerLock();
    });
  });
});
