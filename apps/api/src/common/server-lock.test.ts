import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  checkServerLock,
  isProcessAlive,
  readServerLock,
  removeServerLock,
  resolveServerLockPath,
  writeServerLock,
} from './server-lock';

describe('server-lock', () => {
  // 실제 파일을 다루므로 임시 디렉터리에 DB 경로를 만들어 두고 DATABASE_URL 로 가리킨다.
  // vitest.config.ts 가 fileParallelism: false 라 cwd 가 새면 뒤에 실행되는 모든 테스트 파일이
  // 깨진다 — 임시 디렉터리를 지우기 전에 cwd 를 먼저 되돌린다.
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = process.env.DATABASE_URL;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-server-lock-'));
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

  describe('resolveServerLockPath', () => {
    it('DB 파일과 같은 폴더에 sp-server.lock 으로 만든다', () => {
      const lockPath = resolveServerLockPath().replace(/\\/g, '/');
      expect(lockPath).toBe(`${tmpDir.replace(/\\/g, '/')}/data/sp-server.lock`);
    });

    it('상대경로 DATABASE_URL 도 절대경로로 정규화한다 (안내 문구에 그대로 싣기 때문)', () => {
      process.chdir(tmpDir);
      process.env.DATABASE_URL = 'file:./data/app.db';
      expect(path.isAbsolute(resolveServerLockPath())).toBe(true);
    });

    it('URL 에 쿼리스트링이 섞여도 폴더 이름이 오염되지 않는다', () => {
      const base = path.join(tmpDir, 'data', 'app.db').replace(/\\/g, '/');
      process.env.DATABASE_URL = `file:${base}?connection_limit=1`;
      expect(resolveServerLockPath()).toBe(path.join(tmpDir, 'data', 'sp-server.lock'));
    });
  });

  describe('쓰기 / 읽기 / 삭제 왕복', () => {
    it('쓴 PID 를 그대로 읽고, 지우면 다시 undefined 가 된다', () => {
      expect(readServerLock()).toBeUndefined();

      expect(writeServerLock(12345)).toBe(true);
      expect(fs.existsSync(resolveServerLockPath())).toBe(true);
      expect(readServerLock()).toBe(12345);

      removeServerLock();
      expect(fs.existsSync(resolveServerLockPath())).toBe(false);
      expect(readServerLock()).toBeUndefined();
    });

    it('인자 없이 쓰면 자기 PID 를 남긴다', () => {
      writeServerLock();
      expect(readServerLock()).toBe(process.pid);
    });

    it('DB 폴더가 아직 없어도 만들어 쓴다 (부팅 순서에 따라 없을 수 있다)', () => {
      process.env.DATABASE_URL = `file:${path.join(tmpDir, 'fresh', 'app.db').replace(/\\/g, '/')}`;
      expect(writeServerLock(4242)).toBe(true);
      expect(readServerLock()).toBe(4242);
    });

    it('잠금 파일이 없을 때 지워도 예외를 던지지 않는다', () => {
      expect(() => removeServerLock()).not.toThrow();
    });

    it('내용이 깨진 잠금 파일은 잠금 없음으로 본다', () => {
      // PID 를 모르면 생존 판단도, 안내 문구에 실을 번호도 없다. 판단 불가 상태로 업그레이드를
      // 영구히 막지 않는다 (server-lock.ts 의 readServerLock() 주석 참고).
      fs.writeFileSync(resolveServerLockPath(), 'not-a-pid\n');
      expect(readServerLock()).toBeUndefined();
      expect(checkServerLock()).toEqual({ kind: 'free' });
    });
  });

  describe('isProcessAlive', () => {
    it('자기 자신은 살아 있다고 본다', () => {
      expect(isProcessAlive(process.pid).alive).toBe(true);
    });

    it('존재하지 않는 PID 는 죽은 것으로 본다', () => {
      // 0 이나 음수는 process.kill 의 특수 의미(프로세스 그룹 등)에 걸리므로 쓰지 않는다.
      // 아주 큰 값은 어떤 OS 에서도 배정되지 않아 ESRCH 가 확실하다.
      expect(isProcessAlive(2 ** 30).alive).toBe(false);
    });
  });

  describe('checkServerLock', () => {
    it('살아 있는 PID 가 적혀 있으면 잠금 경로와 함께 locked 를 돌려준다', () => {
      writeServerLock(process.pid);
      const result = checkServerLock();
      expect(result.kind).toBe('locked');
      if (result.kind === 'locked') {
        expect(result.pid).toBe(process.pid);
        expect(result.lockPath).toBe(resolveServerLockPath());
      }
    });

    it('죽은 PID 가 적힌 낡은 잠금은 막지 않는다', () => {
      // 강제 종료나 콘솔 창 닫기로 남은 잠금이 정상적인 업그레이드를 영구히 막으면 안 된다.
      // 이 방어선이 없으면 폐쇄망 현장에서 손쓸 방법이 사라진다.
      writeServerLock(2 ** 30);
      expect(checkServerLock()).toEqual({ kind: 'free' });
    });

    it('잠금 파일이 아예 없으면 free 다', () => {
      expect(checkServerLock()).toEqual({ kind: 'free' });
    });
  });
});
