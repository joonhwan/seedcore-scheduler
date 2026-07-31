import { checkLock, type LockRole } from '../common/process-lock';
import {
  formatMigrateInProgressNotice,
  formatServerAlreadyRunningNotice,
  formatServerRunningNotice,
} from './migration-messages';

export type LockDecision =
  | { kind: 'proceed' }
  | { kind: 'halt'; exitCode: number; notice: string };

/**
 * 지금 이 실행 파일이 DB 를 잡아도 되는지 판정한다. decideBoot() / decideMigrate() 와 같은 모양
 * (부작용 없이 exit code 와 안내 문구를 값으로 돌려줌)이라 두 exe 가 같은 코드로 판단하고,
 * 테스트에서 네 조합을 값으로 확인할 수 있다.
 *
 * 막는 조합은 네 가지다 (근거는 process-lock.ts 파일 앞머리 주석 — 마이그레이션이 트랜잭션 없이
 * 문장 단위로 커밋되기 때문에 생기는 창).
 *
 *   role='server'  ← 다른 sp-server.exe  : 한 DB 를 두 서버가 고치면 데이터가 어긋난다
 *   role='server'  ← sp-migrate.exe      : 반쯤 재작성된 스키마 위로 부팅하게 된다
 *   role='migrate' ← sp-server.exe       : 적용 도중 커밋된 편집이 사전 백업에도 없이 사라진다
 *   role='migrate' ← 다른 sp-migrate.exe : 두 러너가 같은 파괴적 SQL 을 겹쳐 실행한다
 *
 * exit code 는 네 경우 모두 **7** 이다. 뜻은 "다른 프로세스가 DB 를 쓰고 있어 시작하지 않았다" 로
 * 하나이고, 무엇이 잡고 있으며 무엇을 해야 하는지는 화면 안내로 구분한다. 관리자가 읽는
 * README-exe.txt 의 종료 코드 표를 짧게 유지하려는 선택이다 (exit 1 이 두 안내를 공유하는 것과
 * 같은 방식).
 *
 * 서버 잠금을 먼저 보는 이유: 두 잠금이 동시에 살아 있는 상태는 정상 흐름에서 생기지 않지만
 * (sp-migrate.exe 는 서버가 살아 있으면 시작하지 않는다), 만약 그렇게 되었다면 서비스 중인 서버가
 * 관리자에게 더 급한 정보다.
 */
export function decideLockAcquisition(role: LockRole): LockDecision {
  const serverLock = checkLock('server');
  if (serverLock.kind === 'locked') {
    const params = {
      pid: serverLock.pid,
      lockPath: serverLock.lockPath,
      ...(serverLock.note === undefined ? {} : { note: serverLock.note }),
    };
    return {
      kind: 'halt',
      exitCode: 7,
      notice:
        role === 'server'
          ? formatServerAlreadyRunningNotice(params)
          : formatServerRunningNotice(params),
    };
  }

  const migrateLock = checkLock('migrate');
  if (migrateLock.kind === 'locked') {
    return {
      kind: 'halt',
      exitCode: 7,
      notice: formatMigrateInProgressNotice({
        pid: migrateLock.pid,
        lockPath: migrateLock.lockPath,
        // 다시 실행할 실행 파일은 "막힌 쪽" 이다. 서버를 시작하려던 관리자에게
        // "sp-migrate.exe 를 다시 실행하라" 고 말하면 안 된다.
        retryCommand: role === 'server' ? 'sp-server.exe' : 'sp-migrate.exe',
        ...(migrateLock.note === undefined ? {} : { note: migrateLock.note }),
      }),
    };
  }

  return { kind: 'proceed' };
}
