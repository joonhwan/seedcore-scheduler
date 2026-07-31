import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveLockPath, writeLock } from '../common/process-lock';
import { decideLockAcquisition } from './lock-decision';

// 어떤 OS 에서도 배정되지 않는 값 → 강제 종료 후 남은 낡은 잠금과 같은 상태를 만든다.
const DEAD_PID = 2 ** 30;

describe('decideLockAcquisition', () => {
  // 잠금 파일 경로가 DATABASE_URL 에서 파생되므로 임시 디렉터리로 갈아탄다.
  // vitest.config.ts 가 fileParallelism: false 라 cwd 가 새면 뒤 테스트 파일이 모두 깨진다 —
  // 임시 디렉터리를 지우기 전에 cwd 를 되돌린다.
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    originalEnv = process.env.DATABASE_URL;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-lock-decision-'));
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

  it('잠금이 없으면 양쪽 다 진행한다', () => {
    expect(decideLockAcquisition('server')).toEqual({ kind: 'proceed' });
    expect(decideLockAcquisition('migrate')).toEqual({ kind: 'proceed' });
  });

  describe('sp-server.exe 가 살아 있을 때', () => {
    beforeEach(() => {
      // 확실히 살아 있는 PID = 이 테스트 프로세스 자신.
      writeLock('server', process.pid);
    });

    it('다른 서버 시작을 exit 7 로 막고, 서버가 이미 실행 중이라고 안내한다', () => {
      const decision = decideLockAcquisition('server');
      expect(decision.kind).toBe('halt');
      if (decision.kind !== 'halt') return;
      expect(decision.exitCode).toBe(7);
      expect(decision.notice).toContain('이미 sp-server.exe 가 실행 중입니다');
      expect(decision.notice).toContain(`PID ${process.pid}`);
      expect(decision.notice).toContain('데이터베이스는 전혀 변경되지 않았습니다');
      expect(decision.notice).toContain(resolveLockPath('server'));
    });

    it('업그레이드를 exit 7 로 막고, 서버를 종료하라고 안내한다', () => {
      const decision = decideLockAcquisition('migrate');
      expect(decision.kind).toBe('halt');
      if (decision.kind !== 'halt') return;
      expect(decision.exitCode).toBe(7);
      expect(decision.notice).toContain('sp-server.exe 가 아직 실행 중입니다');
      expect(decision.notice).toContain(
        'sp-server.exe 를 종료한 뒤 sp-migrate.exe 를 다시 실행하십시오.',
      );
      expect(decision.notice).toContain(resolveLockPath('server'));
    });
  });

  describe('sp-migrate.exe 가 업그레이드 중일 때', () => {
    beforeEach(() => {
      writeLock('migrate', process.pid);
    });

    it('서버 시작을 exit 7 로 막고, 다시 실행할 대상을 sp-server.exe 로 안내한다', () => {
      const decision = decideLockAcquisition('server');
      expect(decision.kind).toBe('halt');
      if (decision.kind !== 'halt') return;
      expect(decision.exitCode).toBe(7);
      expect(decision.notice).toContain('sp-migrate.exe 가 업그레이드를 진행 중입니다');
      expect(decision.notice).toContain('sp-server.exe 를 실행하십시오');
      // 업그레이드를 강제 종료하면 스키마가 절반만 남는다 — 반드시 경고해야 한다.
      expect(decision.notice).toContain('강제로 종료하거나 그 창을 닫지 마십시오');
      // 탈출구 경로는 마이그레이션 잠금 파일이어야 한다 (서버 잠금이 아니다).
      expect(decision.notice).toContain(resolveLockPath('migrate'));
      expect(decision.notice).not.toContain(resolveLockPath('server'));
    });

    it('또 다른 업그레이드도 exit 7 로 막는다', () => {
      const decision = decideLockAcquisition('migrate');
      expect(decision.kind).toBe('halt');
      if (decision.kind !== 'halt') return;
      expect(decision.exitCode).toBe(7);
      expect(decision.notice).toContain('sp-migrate.exe 가 업그레이드를 진행 중입니다');
      expect(decision.notice).toContain('sp-migrate.exe 를 실행하십시오');
      expect(decision.notice).toContain(resolveLockPath('migrate'));
    });
  });

  describe('낡은 잠금 (죽은 PID)', () => {
    it('서버 잠금이 낡았으면 아무것도 막지 않는다', () => {
      writeLock('server', DEAD_PID);
      expect(decideLockAcquisition('server')).toEqual({ kind: 'proceed' });
      expect(decideLockAcquisition('migrate')).toEqual({ kind: 'proceed' });
    });

    it('마이그레이션 잠금이 낡았으면 아무것도 막지 않는다', () => {
      writeLock('migrate', DEAD_PID);
      expect(decideLockAcquisition('server')).toEqual({ kind: 'proceed' });
      expect(decideLockAcquisition('migrate')).toEqual({ kind: 'proceed' });
    });
  });

  it('두 잠금이 모두 살아 있으면 서버 잠금을 먼저 알린다', () => {
    // 정상 흐름에서는 생기지 않는 상태다. 그렇게 되었다면 서비스 중인 서버가 더 급한 정보다.
    writeLock('server', process.pid);
    writeLock('migrate', process.pid);
    const decision = decideLockAcquisition('migrate');
    expect(decision.kind).toBe('halt');
    if (decision.kind !== 'halt') return;
    expect(decision.notice).toContain('sp-server.exe 가 아직 실행 중입니다');
  });
});
