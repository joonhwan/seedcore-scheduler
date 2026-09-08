import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitService } from './rate-limit';

/**
 * 로그인 제한이 걸렸을 때 **얼마나 기다려야 하는지**를 호출자가 알 수 있어야 한다는 것이
 * 이 테스트의 핵심이다. 예전 check() 는 boolean 만 돌려줬고, 그래서 서버는 화면에
 * "잠시 후 다시 시도하세요" 라고만 말할 수 있었다 (얼마나 기다려야 하는지는 서버도 몰랐다).
 */

const LIMIT = 10;
const WINDOW = 60_000;

describe('RateLimitService.check', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T05:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('한도까지는 통과시키고 남은 대기 시간을 0 으로 준다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT; i++) {
      const r = svc.check('k', LIMIT, WINDOW);
      expect(r.allowed, `${i + 1}번째 요청`).toBe(true);
      expect(r.retryAfterMs).toBe(0);
    }
  });

  it('한도를 넘긴 요청부터 막고, 창이 끝날 때까지 남은 시간을 알려준다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT; i++) svc.check('k', LIMIT, WINDOW);

    vi.advanceTimersByTime(5_000);
    const blocked = svc.check('k', LIMIT, WINDOW);

    expect(blocked.allowed).toBe(false);
    // 창은 첫 요청 시각에 시작했으므로 60초 중 5초가 지났다.
    expect(blocked.retryAfterMs).toBe(55_000);
  });

  it('막힌 동안 다시 시도해도 대기 시간이 늘어나지 않는다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT; i++) svc.check('k', LIMIT, WINDOW);

    vi.advanceTimersByTime(5_000);
    const first = svc.check('k', LIMIT, WINDOW);
    for (let i = 0; i < 20; i++) svc.check('k', LIMIT, WINDOW);
    const last = svc.check('k', LIMIT, WINDOW);

    // 재시도가 창 시작 시각을 밀지 않으므로 벌칙이 누적되지 않는다.
    expect(first.retryAfterMs).toBe(55_000);
    expect(last.retryAfterMs).toBe(55_000);
  });

  it('창이 지나면 다시 통과한다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT; i++) svc.check('k', LIMIT, WINDOW);
    expect(svc.check('k', LIMIT, WINDOW).allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW);

    expect(svc.check('k', LIMIT, WINDOW).allowed).toBe(true);
  });

  it('키가 다르면 서로 영향을 주지 않는다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT + 5; i++) svc.check('a', LIMIT, WINDOW);

    expect(svc.check('a', LIMIT, WINDOW).allowed).toBe(false);
    expect(svc.check('b', LIMIT, WINDOW).allowed).toBe(true);
  });
});

describe('RateLimitService.reset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T05:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('비운 뒤에는 한도가 처음부터 다시 주어진다', () => {
    const svc = new RateLimitService();
    for (let i = 0; i < LIMIT; i++) svc.check('k', LIMIT, WINDOW);
    expect(svc.check('k', LIMIT, WINDOW).allowed).toBe(false);

    svc.reset('k');

    for (let i = 0; i < LIMIT; i++) {
      expect(svc.check('k', LIMIT, WINDOW).allowed).toBe(true);
    }
  });
});
