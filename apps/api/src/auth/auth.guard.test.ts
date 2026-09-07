import { describe, expect, it, vi } from 'vitest';
import { AuthGuard, NO_SESSION_TOUCH_KEY, SESSION_COOKIE_NAME } from './auth.guard';
import type { SessionsService } from '../sessions/sessions.service';
import type { Reflector } from '@nestjs/core';

const SESSION = {
  sid: 's1',
  expiresAt: new Date('2026-09-07T21:00:00.000Z'),
  user: {
    id: 'u1',
    username: 'kim',
    displayName: '김철수',
    globalRole: 'USER',
    passwordMustChange: false,
    isActive: true,
  },
};

/**
 * 가드가 실제로 부르는 것만 흉내 낸 좁은 대역이다.
 * metadata 맵에 담긴 키만 켜진 것으로 본다.
 */
function build(metadata: Record<string, boolean> = {}) {
  const touch = vi.fn().mockResolvedValue(SESSION);
  const peek = vi.fn().mockResolvedValue(SESSION);
  const sessions = { touch, peek } as unknown as SessionsService;

  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;

  const req: Record<string, unknown> = {
    cookies: { [SESSION_COOKIE_NAME]: 's1' },
    headers: {},
  };
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as never;

  return { guard: new AuthGuard(sessions, reflector), context, req, touch, peek };
}

describe('AuthGuard 의 세션 갱신 분기', () => {
  it('보통 라우트는 lastSeenAt 을 갱신한다 (touch)', async () => {
    const { guard, context, touch, peek } = build();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(touch).toHaveBeenCalledWith('s1');
    expect(peek).not.toHaveBeenCalled();
  });

  it('@NoSessionTouch 라우트는 갱신하지 않는다 (peek)', async () => {
    // 이 시험이 이 분기의 존재 이유다. 예고 폴링이 lastSeenAt 을 올리면, 브라우저만 켜 두고
    // 자리를 비운 사람이 영원히 접속 중으로 남아 접속자 목록이 무의미해진다.
    const { guard, context, touch, peek } = build({ [NO_SESSION_TOUCH_KEY]: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(peek).toHaveBeenCalledWith('s1');
    expect(touch).not.toHaveBeenCalled();
  });

  it('@NoSessionTouch 라우트도 인증은 그대로 한다', async () => {
    const { guard, context, req } = build({ [NO_SESSION_TOUCH_KEY]: true });
    await guard.canActivate(context);
    expect((req as { user?: { id: string } }).user?.id).toBe('u1');
  });
});
