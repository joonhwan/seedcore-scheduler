import * as fs from 'fs';
import * as path from 'path';
import { resolveDbFilePath } from './db-path';

/**
 * DB 파일을 쥐는 두 실행 파일의 상호 배제(mutual exclusion)용 잠금 파일.
 *
 * 왜 필요한가 (이 파일 전체의 존재 이유):
 * 마이그레이션 적용은 의도적으로 트랜잭션으로 감싸지 않는다 (설계 문서 6절 — PRAGMA 가
 * 트랜잭션 안에서 무력화되기 때문). 그래서 SQLite 테이블 재정의(RedefineTables)는 문장 하나하나가
 * 그 자리에서 커밋된다.
 *
 *     CREATE TABLE "new_schedule_nodes" (...)                              -- 커밋
 *     INSERT INTO "new_schedule_nodes" SELECT ... FROM "schedule_nodes"    -- 커밋
 *     DROP TABLE "schedule_nodes"                                         -- 커밋
 *     ALTER TABLE "new_schedule_nodes" RENAME TO "schedule_nodes"          -- 커밋
 *
 * INSERT SELECT 와 DROP TABLE 사이에 서버가 사용자 편집 한 건을 커밋하면, 그 행은 이미 복사가
 * 끝난 새 테이블에 없고 DROP 이 원본 테이블째로 지워버린다. WAL 모드는 이걸 막아주지 않는다 —
 * 읽기와 쓰기가 동시에 진행되는 것이 WAL 의 목적이고, 스키마 변경은 다른 커넥션에게 재준비
 * (re-prepare)를 유발할 뿐이다.
 *
 * 더 나쁜 것은 **사전 백업으로도 복구할 수 없다**는 점이다. 백업은 마이그레이션 시작 전에 떠 놓은
 * 것이라 그 편집은 애초에 백업에도 없다. 조용히, 되돌릴 수 없이 사라진다.
 *
 * 이 위험은 "서버 실행 중 마이그레이션" 한 방향만이 아니다. 같은 이유로 아래 네 조합을 모두 막는다.
 *
 *   - sp-migrate.exe 실행 중 → sp-migrate.exe 금지  (두 러너가 같은 문장을 겹쳐 실행)
 *   - sp-server.exe  실행 중 → sp-migrate.exe 금지  (위의 편집 소실)
 *   - sp-migrate.exe 실행 중 → sp-server.exe  금지  (반쯤 재작성된 스키마 위로 부팅. 사라진
 *                                                    테이블을 읽거나, 곧 DROP 될 테이블에 쓴다)
 *   - sp-server.exe  실행 중 → sp-server.exe  금지  (한 DB 에 두 개의 쓰기 주체)
 *
 * 그래서 역할별로 잠금 파일을 따로 둔다. 하나로 합치면 "무엇이 잡고 있는지" 를 구분할 수 없어
 * 관리자에게 맞는 안내(무엇을 종료해야 하는지, 기다려야 하는지)를 줄 수 없다.
 */
export type LockRole = 'server' | 'migrate';

const LOCK_FILE_NAMES: Record<LockRole, string> = {
  server: 'sp-server.lock',
  migrate: 'sp-migrate.lock',
};

/**
 * 잠금 파일 경로. DB 파일 옆이다.
 *
 * 새 위치를 발명하지 않고 resolveDbFilePath() 에서 파생시키는 이유는 두 exe 가 반드시 같은 파일을
 * 보게 하기 위해서다 — DATABASE_URL 을 옮기면 잠금도 함께 따라간다. 두 exe 가 서로 다른 잠금
 * 파일을 보면 이 방어선은 있으나 마나가 된다 (db-path.ts 의 resolveDatabaseUrl() 주석과 같은 이유).
 *
 * 절대경로로 정규화하는 이유: `.env` 의 DATABASE_URL 이 상대경로("file:./data/app.db")일 수 있고,
 * 그때 path.dirname() 결과도 상대경로라 삭제 안내에 그대로 실으면 관리자가 지울 파일을 찾을 수
 * 없다. 쿼리스트링을 떼는 것도 같은 이유의 방어다 — resolveDbFilePath() 는 'file:' 접두어만
 * 벗기므로 URL 에 '?connection_limit=1' 같은 값이 섞여 있으면 디렉터리 이름이 오염된다.
 */
export function resolveLockPath(role: LockRole): string {
  const dbFile = resolveDbFilePath();
  const queryIndex = dbFile.indexOf('?');
  const pureDbFile = queryIndex === -1 ? dbFile : dbFile.slice(0, queryIndex);
  const dir = path.resolve(process.cwd(), path.dirname(pureDbFile));
  return path.join(dir, LOCK_FILE_NAMES[role]);
}

/**
 * 잠금 파일을 만든다.
 *
 * 이 함수를 직접 부르지 말고 `acquireLock()`(src/prisma/lock-decision.ts)을 쓰십시오. 그쪽이
 * "확인 → 기록 → 되읽어 검증" 을 한 경로로 묶는다. 여기서는 이미 있는 파일을 그냥 덮어쓴다 —
 * 낡은(죽은 PID) 잠금을 정리하는 경로가 필요하기 때문이다. 확인 없이 부르면 두 번째 인스턴스가
 * 첫 번째의 PID 를 지워버리고, 그 뒤에 두 번째가 끝나면서 자기 잠금을 지우는 순간 첫 번째가
 * 살아 있는데도 잠금이 사라진다.
 *
 * 확인과 기록이 원자적이지 않은 점(TOCTOU)은 `acquireLock()` 의 되읽어 검증이 처리한다: 같은 순간
 * 두 프로세스가 모두 기록했다면 파일에 자기 PID 가 남은 하나만 진행하고 나머지는 멈춘다.
 *
 * 여기서 막으려는 것은 악의적 경쟁이 아니라 "서버를 끄지 않고 업그레이드" 같은 운영 실수다.
 *
 * 실패해도 예외를 던지지 않는다(호출자가 판단할 수 있게 boolean 을 돌려준다). 잠금을 못 만들었다고
 * 서버 시작을 막으면, 안전장치가 서비스 중단 사유로 바뀐다.
 */
export function writeLock(role: LockRole, pid: number = process.pid): boolean {
  const lockPath = resolveLockPath(role);
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    // 첫 줄은 PID 만 둔다 — readLock() 이 첫 줄만 읽는다. 둘째 줄은 관리자가 파일을 열어
    // 봤을 때 "언제부터 잡고 있는 잠금인지" 를 알 수 있게 하는 사람용 정보다.
    fs.writeFileSync(lockPath, `${pid}\nstarted_at=${new Date().toISOString()}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 잠금 파일을 지운다. **내 PID 가 적혀 있을 때만** 지운다.
 *
 * 소유권 확인이 이 함수의 핵심이다. 무조건 지우면 다음 사고가 난다: 서버 B 가 실수로 A 의 잠금을
 * 덮어쓴 뒤 B 만 종료하면, B 의 정리 코드가 잠금을 지워버리고 A 는 여전히 서비스 중인데
 * sp-migrate.exe 가 "잠금 없음" 으로 보고 진행한다 — 이 잠금이 막으려던 데이터 소실이 그대로
 * 일어난다. 남의 잠금은 건드리지 않고, 낡은 잠금은 PID 생존 확인(isProcessAlive)이 무해하게
 * 걸러 준다.
 *
 * 내용이 깨져 PID 를 읽을 수 없는 파일도 지우지 않는다. 소유권을 증명할 수 없기 때문이고,
 * checkLock() 이 그런 파일을 "잠금 없음" 으로 취급하므로 남아도 아무것도 막지 않는다.
 */
export function removeLock(role: LockRole, pid: number = process.pid): void {
  if (readLock(role) !== pid) {
    return;
  }
  try {
    fs.unlinkSync(resolveLockPath(role));
  } catch {
    // 이미 없거나 지울 권한이 없는 경우. 종료 경로에서 예외를 올릴 이유가 없다.
  }
}

/**
 * 잠금 파일에 적힌 PID. 파일이 없거나 첫 줄이 숫자가 아니면 undefined.
 *
 * 내용이 깨진 파일을 undefined 로 처리하는 이유: PID 를 모르면 생존 여부를 판단할 수 없고,
 * 판단할 수 없는 상태로 업그레이드를 영구히 막으면 안내에 적을 PID 도 없이 관리자를 가둬버린다.
 * 서버를 먼저 종료하라는 README 안내가 1차 방어선으로 남아 있으므로, 여기서는 "잠금 없음" 으로
 * 취급해 진행시킨다.
 */
export function readLock(role: LockRole): number | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(resolveLockPath(role), 'utf-8');
  } catch {
    return undefined;
  }
  const firstLine = contents.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!/^\d+$/.test(firstLine)) {
    return undefined;
  }
  const pid = Number(firstLine);
  return pid > 0 ? pid : undefined;
}

/**
 * PID 가 살아 있는지 본다. 존재 여부가 아니라 **생존 여부**로 판단해야 한다 —
 * 강제 종료(작업 관리자, 콘솔 창 닫기)로 남은 낡은 잠금 파일이 업그레이드나 서버 시작을 영구히
 * 막으면 안 된다.
 *
 * process.kill(pid, 0) 은 시그널을 보내지 않고 대상 존재만 확인하는 표준 관용구다.
 * - ESRCH  : 그런 프로세스가 없다 → 죽었다.
 * - EPERM  : 프로세스는 있는데 우리가 시그널을 보낼 권한이 없다 → **살아 있다** 로 본다.
 *            (다른 사용자 계정으로 실행된 서버가 실제로 이 경우다.)
 * - 그 외  : 알 수 없으므로 안전한 쪽인 "살아 있다" 로 보고, 이유를 함께 돌려준다.
 */
export function isProcessAlive(pid: number): { alive: boolean; note?: string } {
  try {
    process.kill(pid, 0);
    return { alive: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      return { alive: false };
    }
    if (code === 'EPERM') {
      return { alive: true, note: '다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)' };
    }
    return {
      alive: true,
      note: `프로세스 상태를 확인할 수 없어 실행 중으로 간주했습니다 (${code ?? String(err)})`,
    };
  }
}

export type LockCheck =
  | { kind: 'free' }
  | { kind: 'locked'; role: LockRole; pid: number; lockPath: string; note?: string };

/**
 * 한 역할의 잠금 상태 판정. 살아 있는 프로세스가 잡고 있으면 'locked'.
 *
 * lockPath 를 함께 돌려주는 이유는 안내 문구가 그 경로를 그대로 실어야 하기 때문이다.
 * 윈도우는 PID 를 재사용하므로, 낡은 잠금 파일의 PID 가 이미 다른 프로그램에게 배정되어
 * 생존 판정이 거짓 양성을 낼 수 있다. 그 경우 관리자에게 남는 유일한 탈출구가
 * "이 파일을 지우고 다시 실행" 이며, 그러려면 경로를 알려줘야 한다.
 *
 * 자기 PID 를 예외 처리하지 않는다. 두 실행 파일은 항상 서로 다른 프로세스이므로 실제 배포에서는
 * 그런 상황이 없고, 예외를 두면 "살아 있는 PID 로 잠긴 상태" 를 테스트에서 재현할 방법
 * (process.pid 를 쓰는 것이 유일하게 확실한 방법)이 사라진다.
 */
export function checkLock(role: LockRole): LockCheck {
  const pid = readLock(role);
  if (pid === undefined) {
    return { kind: 'free' };
  }
  const liveness = isProcessAlive(pid);
  if (!liveness.alive) {
    return { kind: 'free' };
  }
  const lockPath = resolveLockPath(role);
  return liveness.note === undefined
    ? { kind: 'locked', role, pid, lockPath }
    : { kind: 'locked', role, pid, lockPath, note: liveness.note };
}
