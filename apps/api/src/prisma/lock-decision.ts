import {
  checkLock,
  readLock,
  resolveLockPath,
  writeLock,
  type LockRole,
} from '../common/process-lock';
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

export type LockAcquisition =
  | { kind: 'acquired'; held: boolean; warning?: string }
  | { kind: 'halt'; exitCode: number; notice: string };

/**
 * 확인 → 기록 → **되읽어 검증** 순으로 잠금을 확보한다. 두 exe 의 유일한 잠금 획득 경로다.
 *
 * 확인과 기록이 원자적이지 않다는 점(TOCTOU)이 남는 문제였다. 같은 순간에 뜬 두 프로세스가 둘 다
 * 'free' 를 읽고 둘 다 기록하면 파일에는 나중에 쓴 쪽의 PID 만 남는데, 소유권 기반 해제만으로는
 * "먼저 쓴 쪽" 이 진행하는 것을 막지 못한다 — 나중 쪽이 끝나며 잠금을 지우는 순간 먼저 쓴 쪽은
 * DROP TABLE 한복판인데 아무 표시도 남지 않는다.
 *
 * 되읽어 검증이 이 경우를 결정적으로 가른다. 기록 직후 파일에 내 PID 가 남아 있지 않다면 경쟁에서
 * 진 것이므로, 사전 확인이 잡아냈을 것과 같은 안내로 멈춘다. 그래서 두 프로세스 중 정확히 하나만
 * 진행한다. 실제로 동시 기록이 없었다면 되읽기는 항상 내 PID 이므로 이 검증이 정상 실행을
 * 막는 일은 없다.
 *
 * 남는 창: 낡은 잠금 정리 경로(readLock 으로 죽은 PID 확인 → 덮어쓰기)는 여전히 원자적이지 않다.
 * 다만 그 경쟁에서 지는 쪽도 이 검증에 걸려 멈추므로 데이터 손실로 이어지지 않는다.
 *
 * `held` 가 false 인 'acquired': 잠금 파일을 만들지 못했지만(권한/디스크) 계속 진행하는 경우다.
 * 안전장치를 못 걸었다고 폐쇄망에서 서버 시작이나 업그레이드 자체를 막으면, 안전장치가 서비스
 * 중단 사유로 바뀐다. 대신 `warning` 을 돌려주므로 호출자가 화면과 로그에 남긴다 — 안전장치가
 * 조용히 꺼진 채로 돌아가는 상황을 아무도 모르게 두지 않는다.
 */
export function acquireLock(role: LockRole): LockAcquisition {
  const pre = decideLockAcquisition(role);
  if (pre.kind === 'halt') {
    return pre;
  }

  const lockPath = resolveLockPath(role);
  if (!writeLock(role)) {
    return {
      kind: 'acquired',
      held: false,
      warning:
        `경고: 잠금 파일을 만들지 못했습니다 (${lockPath}). 다른 프로그램이 같은 데이터베이스를 ` +
        '동시에 사용하는 것을 막을 수 없는 상태로 계속 진행합니다. 이 폴더의 쓰기 권한과 디스크 ' +
        '여유 공간을 확인하십시오.',
    };
  }

  if (readLock(role) === process.pid) {
    return { kind: 'acquired', held: true };
  }

  // 내가 쓴 값이 남아 있지 않다 = 같은 순간 다른 프로세스가 덮어썼다. 그쪽이 살아 있으면
  // 사전 확인과 같은 안내로 멈춘다 (여기서 잠금을 지우려 하지 않는다 — removeLock() 은 소유권을
  // 확인하므로 시도해도 지워지지 않지만, 애초에 남의 잠금을 건드리려는 코드를 두지 않는다).
  const post = decideLockAcquisition(role);
  if (post.kind === 'halt') {
    return post;
  }

  // 덮어쓴 쪽이 이미 죽었거나 내용이 깨진 드문 경우. 막을 근거는 없지만 잠금을 쥐었다고 말할 수도
  // 없으므로, 경고만 남기고 진행한다.
  return {
    kind: 'acquired',
    held: false,
    warning:
      `경고: 잠금 파일(${lockPath})의 내용이 예상과 다릅니다. 다른 프로그램이 같은 데이터베이스를 ` +
      '동시에 사용하는 것을 막을 수 없는 상태로 계속 진행합니다.',
  };
}
