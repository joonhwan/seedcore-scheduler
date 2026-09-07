/**
 * 접속자 판정 (순수 함수 — DB 조회와 떼어 두고 시험한다).
 *
 * 서버는 브라우저가 닫혔는지 알 수 없다. 그래서 "최근 창 안에 활동한 사람"을 접속 중으로 보는
 * 근사치를 쓴다(㉳ 회신). 그냥 닫은 사람은 최대 창 길이만큼 목록에 남는다.
 */
import type { ActiveUserView } from '@sam/shared';

export interface SessionRowForActive {
  userId: string;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  user: { username: string; displayName: string };
}

/**
 * 접속 중인 사람을 최근 활동 순으로 돌려준다.
 *
 * 만료 검사를 함께 하는 것이 중요하다. 만료된 세션 행은 즉시 지워지지 않으므로
 * lastSeenAt 만 보면 이미 끊긴 사람이 섞인다.
 */
export function selectActiveUsers(
  rows: SessionRowForActive[],
  now: Date,
  windowMs: number,
): ActiveUserView[] {
  const since = now.getTime() - windowMs;
  const byUser = new Map<string, { view: ActiveUserView; lastSeenMs: number }>();

  for (const r of rows) {
    if (r.lastSeenAt.getTime() < since) continue;
    if (r.expiresAt.getTime() <= now.getTime()) continue;

    const found = byUser.get(r.userId);
    if (!found) {
      byUser.set(r.userId, {
        lastSeenMs: r.lastSeenAt.getTime(),
        view: {
          userId: r.userId,
          username: r.user.username,
          displayName: r.user.displayName,
          lastSeenAt: r.lastSeenAt.toISOString(),
          ips: r.ip === null ? [] : [r.ip],
        },
      });
      continue;
    }

    // 같은 사람이 창을 여럿 열었다. 가장 최근 활동을 대표로 쓰고 IP 는 모아 둔다.
    if (r.lastSeenAt.getTime() > found.lastSeenMs) {
      found.lastSeenMs = r.lastSeenAt.getTime();
      found.view.lastSeenAt = r.lastSeenAt.toISOString();
    }
    if (r.ip !== null && !found.view.ips.includes(r.ip)) {
      found.view.ips.push(r.ip);
    }
  }

  return [...byUser.values()]
    .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
    .map((e) => e.view);
}
