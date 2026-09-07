import { describe, expect, it } from 'vitest';
import { ACTIVE_SESSION_WINDOW_MS } from '@sam/shared';
import { selectActiveUsers, type SessionRowForActive } from './active-sessions';

const NOW = new Date('2026-09-07T09:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60 * 1000);

function row(over: Partial<SessionRowForActive> = {}): SessionRowForActive {
  return {
    userId: 'u1',
    lastSeenAt: minutesAgo(1),
    expiresAt: minutesLater(60),
    ip: '10.0.0.1',
    user: { username: 'kim', displayName: '김철수' },
    ...over,
  };
}

describe('selectActiveUsers', () => {
  it('창 안에서 활동한 사람을 접속 중으로 본다', () => {
    const out = selectActiveUsers([row()], NOW, ACTIVE_SESSION_WINDOW_MS);
    expect(out).toHaveLength(1);
    expect(out[0]!.displayName).toBe('김철수');
    expect(out[0]!.ips).toEqual(['10.0.0.1']);
  });

  it('창을 벗어난 사람은 뺀다', () => {
    const out = selectActiveUsers([row({ lastSeenAt: minutesAgo(6) })], NOW, ACTIVE_SESSION_WINDOW_MS);
    expect(out).toEqual([]);
  });

  it('경계(정확히 5분 전)는 포함한다', () => {
    const out = selectActiveUsers([row({ lastSeenAt: minutesAgo(5) })], NOW, ACTIVE_SESSION_WINDOW_MS);
    expect(out).toHaveLength(1);
  });

  it('만료된 세션은 활동이 최근이어도 뺀다', () => {
    // 만료된 세션 행은 즉시 지워지지 않는다. lastSeenAt 만 보면 이미 끊긴 사람이 섞인다.
    const out = selectActiveUsers(
      [row({ lastSeenAt: minutesAgo(1), expiresAt: minutesAgo(1) })],
      NOW,
      ACTIVE_SESSION_WINDOW_MS,
    );
    expect(out).toEqual([]);
  });

  it('같은 사람의 세션이 여럿이면 한 줄로 묶고 가장 최근 활동을 쓴다', () => {
    const out = selectActiveUsers(
      [
        row({ lastSeenAt: minutesAgo(4), ip: '10.0.0.1' }),
        row({ lastSeenAt: minutesAgo(1), ip: '10.0.0.2' }),
      ],
      NOW,
      ACTIVE_SESSION_WINDOW_MS,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.lastSeenAt).toBe(minutesAgo(1).toISOString());
    expect(out[0]!.ips).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('같은 IP 로 여러 창을 열었으면 IP 를 한 번만 싣는다', () => {
    const out = selectActiveUsers(
      [row({ ip: '10.0.0.1' }), row({ ip: '10.0.0.1' })],
      NOW,
      ACTIVE_SESSION_WINDOW_MS,
    );
    expect(out[0]!.ips).toEqual(['10.0.0.1']);
  });

  it('IP 를 모르는 세션은 목록에서 IP 없이 센다', () => {
    const out = selectActiveUsers([row({ ip: null })], NOW, ACTIVE_SESSION_WINDOW_MS);
    expect(out).toHaveLength(1);
    expect(out[0]!.ips).toEqual([]);
  });

  it('가장 최근에 활동한 사람이 앞에 온다', () => {
    const out = selectActiveUsers(
      [
        row({ userId: 'u1', lastSeenAt: minutesAgo(4), user: { username: 'a', displayName: 'A' } }),
        row({ userId: 'u2', lastSeenAt: minutesAgo(1), user: { username: 'b', displayName: 'B' } }),
      ],
      NOW,
      ACTIVE_SESSION_WINDOW_MS,
    );
    expect(out.map((u) => u.userId)).toEqual(['u2', 'u1']);
  });
});
