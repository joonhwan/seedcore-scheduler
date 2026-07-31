import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readLock, resolveLockPath, writeLock } from '../common/process-lock';
import { acquireLock, decideLockAcquisition } from './lock-decision';

/**
 * 기록 직후 다른 프로세스가 같은 잠금 파일을 덮어쓰는 상황(TOCTOU 경쟁에서 지는 쪽)을 재현하기
 * 위한 훅. 값이 있으면 writeLock() 이 정상 기록을 마친 **뒤** 그 PID 로 한 번 더 덮어쓴다.
 *
 * fs 를 직접 스파이하지 않는 이유: 네임스페이스 임포트로 들어온 fs.writeFileSync 는 재정의할 수
 * 없어(esbuild ESM 상호운용) vi.spyOn 이 TypeError 를 낸다. 그래서 잠금 모듈 경계에서 끼워넣는다.
 */
let overwriteLockWith: number | undefined;

vi.mock('../common/process-lock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/process-lock')>();
  return {
    ...actual,
    writeLock: (role: 'server' | 'migrate', pid?: number) => {
      const ok = pid === undefined ? actual.writeLock(role) : actual.writeLock(role, pid);
      if (overwriteLockWith !== undefined) {
        actual.writeLock(role, overwriteLockWith);
      }
      return ok;
    },
  };
});

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

  describe('acquireLock 의 되읽어 검증', () => {
    // 확인과 기록 사이의 창(TOCTOU)을 닫는 장치다. 같은 순간 두 프로세스가 모두 기록하면
    // 파일에는 나중 쪽 PID 만 남는데, 되읽어 검증이 없으면 먼저 쓴 쪽도 그대로 진행해버린다.
    let child: ChildProcess | undefined;

    afterEach(() => {
      overwriteLockWith = undefined;
      child?.kill();
      child = undefined;
    });

    it('경쟁이 없으면 잠금을 확보하고 파일에 자기 PID 를 남긴다', () => {
      const result = acquireLock('migrate');
      expect(result).toEqual({ kind: 'acquired', held: true });
      expect(readLock('migrate')).toBe(process.pid);
    });

    it('기록 직후 다른 살아 있는 PID 가 파일을 차지하면 exit 7 로 멈춘다', () => {
      // 진짜로 살아 있는 "남의 PID" 가 필요하다 (죽은 PID 는 판정에서 걸러지므로 이 경로를
      // 재현하지 못한다). 아무것도 하지 않고 대기하는 자식 프로세스를 하나 띄운다.
      child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
      const foreignPid = child.pid!;
      expect(foreignPid).not.toBe(process.pid);

      // 우리 기록이 끝난 직후 그 프로세스가 같은 파일을 덮어쓴 상황을 재현한다.
      overwriteLockWith = foreignPid;

      const result = acquireLock('migrate');
      expect(result.kind).toBe('halt');
      if (result.kind !== 'halt') return;
      expect(result.exitCode).toBe(7);
      expect(result.notice).toContain('sp-migrate.exe 가 업그레이드를 진행 중입니다');
      expect(result.notice).toContain(`PID ${foreignPid}`);

      // 경쟁에서 이긴 쪽의 잠금을 건드리지 않았다.
      expect(readLock('migrate')).toBe(foreignPid);
    });

    it('사전 확인에서 막히면 기록을 시도조차 하지 않는다', () => {
      writeLock('server', process.pid);
      const result = acquireLock('migrate');
      expect(result.kind).toBe('halt');
      expect(readLock('migrate')).toBeUndefined();
    });

    it('잠금 파일을 만들지 못하면 경고와 함께 진행한다 (held=false)', () => {
      // 안전장치를 못 걸었다고 폐쇄망에서 업그레이드 자체를 막으면 안 된다. 대신 조용히 넘기지 않는다.
      // 잠금 파일 경로에 같은 이름의 **디렉터리**를 미리 만들어 두면 기록이 반드시 실패한다
      // (EISDIR). 권한 설정에 의존하지 않는 결정적인 실패 재현 방법이다.
      fs.mkdirSync(resolveLockPath('migrate'));

      const result = acquireLock('migrate');

      expect(result.kind).toBe('acquired');
      if (result.kind !== 'acquired') return;
      expect(result.held).toBe(false);
      expect(result.warning).toContain('잠금 파일을 만들지 못했습니다');
      expect(result.warning).toContain(resolveLockPath('migrate'));
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
