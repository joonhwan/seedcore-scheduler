import { describe, it, expect } from 'vitest';
import {
  formatRemaining,
  remainingMs,
  tickIntervalMs,
  type SessionClock,
} from './sessionCountdown';

/** 서버가 "지금부터 ttlMs 뒤에 끊긴다"고 알려준 상황을 만든다. */
function clock(ttlMs: number, over: Partial<SessionClock> = {}): SessionClock {
  const serverNow = '2026-09-01T09:00:00.000Z';
  return {
    serverNow,
    sessionExpiresAt: new Date(Date.parse(serverNow) + ttlMs).toISOString(),
    receivedAtLocalMs: 1_000_000,
    ...over,
  };
}

describe('remainingMs', () => {
  it('응답을 받은 직후에는 서버가 알려준 남은 시간 그대로다', () => {
    const c = clock(12 * 60 * 60 * 1000);
    expect(remainingMs(c, c.receivedAtLocalMs)).toBe(12 * 60 * 60 * 1000);
  });

  it('받은 뒤 흐른 만큼 줄어든다', () => {
    const c = clock(10 * 60 * 1000);
    expect(remainingMs(c, c.receivedAtLocalMs + 4 * 60 * 1000)).toBe(6 * 60 * 1000);
  });

  it('만료 시각을 지나면 0 으로 멈춘다 (음수가 되지 않는다)', () => {
    const c = clock(60 * 1000);
    expect(remainingMs(c, c.receivedAtLocalMs + 5 * 60 * 1000)).toBe(0);
  });

  it('브라우저 시계가 어긋나 있어도 남은 시간이 흔들리지 않는다', () => {
    // 이 테스트가 이 모듈의 존재 이유다. 브라우저 시각을 절대값으로 쓰면, 시계가 1시간
    // 빠른 PC 에서는 12시간짜리 세션이 11시간으로 보이고, 1시간 느린 PC 에서는 13시간이
    // 남은 것으로 보인다. 경과 시간만 브라우저에서 재므로 두 경우 모두 같은 답이 나온다.
    const ttl = 12 * 60 * 60 * 1000;
    const fast = clock(ttl, { receivedAtLocalMs: 1_000_000 + 60 * 60 * 1000 });
    const slow = clock(ttl, { receivedAtLocalMs: 1_000_000 - 60 * 60 * 1000 });

    expect(remainingMs(fast, fast.receivedAtLocalMs + 1000)).toBe(ttl - 1000);
    expect(remainingMs(slow, slow.receivedAtLocalMs + 1000)).toBe(ttl - 1000);
  });

  it('시각 문자열이 깨져 있으면 0 을 돌려준다', () => {
    const broken = clock(60_000, { sessionExpiresAt: 'not-a-date' });
    expect(remainingMs(broken, broken.receivedAtLocalMs)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('한 시간 이상은 시간과 분으로 보여준다', () => {
    expect(formatRemaining(11 * 60 * 60 * 1000 + 59 * 60 * 1000)).toBe('11시간 59분');
  });

  it('10분 이상 한 시간 미만은 분만 보여준다', () => {
    expect(formatRemaining(25 * 60 * 1000)).toBe('25분');
  });

  it('10분 미만은 초까지 센다', () => {
    expect(formatRemaining(9 * 60 * 1000 + 5000)).toBe('9분 05초');
  });

  it('1분 미만은 초만 보여준다', () => {
    expect(formatRemaining(42_000)).toBe('42초');
  });

  it('다 지났으면 만료됨이다', () => {
    expect(formatRemaining(0)).toBe('만료됨');
  });
});

describe('tickIntervalMs', () => {
  it('연장 창이 뜨는 구간(10분 이하)에서는 1초마다 센다', () => {
    expect(tickIntervalMs(10 * 60 * 1000)).toBe(1000);
    expect(tickIntervalMs(30_000)).toBe(1000);
  });

  it('여유가 있을 때는 느슨하게 돈다', () => {
    expect(tickIntervalMs(11 * 60 * 60 * 1000)).toBe(30_000);
  });
});
