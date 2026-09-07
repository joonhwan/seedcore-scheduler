import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { NO_SESSION_TOUCH_KEY } from '../auth/auth.guard';
import { AdminSessionsController } from './admin-sessions.controller';

/**
 * `AdminSessionsController.active` 에 `@NoSessionTouch()` 가 실제로 붙어 있는지를 못박는다.
 *
 * 이 한 줄이 지워지면 조용히 망가지는 것: 관리자 화면은 접속자 목록을 30초마다 다시
 * 불러온다(`useActiveSessions`). 그 폴링이 `lastSeenAt` 을 갱신하면 목록이 스스로를
 * 관찰 대상에 넣는 꼴이 되어, 화면만 켜 두고 자리를 비운 관리자가 자기 목록에 영원히
 * "방금" 으로 남는다. 에러는 나지 않으므로 목록이 근거를 잃었다는 사실 자체를 아무도
 * 알아채지 못한다. 사용자 쪽 `/server-notices/active` 와 같은 이유다.
 */
describe('AdminSessionsController.active 의 @NoSessionTouch 부착', () => {
  it('접속자 목록 조회는 접속 활동으로 기록되지 않는다', () => {
    const touched = Reflect.getMetadata(
      NO_SESSION_TOUCH_KEY,
      AdminSessionsController.prototype.active,
    );
    expect(touched).toBe(true);
  });
});
