import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { NO_SESSION_TOUCH_KEY } from '../auth/auth.guard';
import { ServerNoticesController } from './server-notices.controller';
import { AdminServerNoticesController } from './admin-server-notices.controller';

/**
 * `ServerNoticesController.active` 에 `@NoSessionTouch()` 가 실제로 붙어 있는지를 못박는다.
 *
 * `auth.guard.test.ts` 는 가드가 그 메타데이터를 봤을 때 어떻게 갈리는지(touch / peek)만
 * 시험하지, 이 컨트롤러 메서드에 데코레이터가 실제로 붙어 있는지는 아무도 주장하지 않았다.
 * 누가 실수로(또는 리팩터링 중에) 이 한 줄을 지워도 나머지 776건은 그대로 통과한다.
 *
 * 그 한 줄이 지워지면 조용히 망가지는 것: 이 엔드포인트는 사용자 화면이 재시작 예고를
 * 확인하려고 주기적으로(폴링) 부르는 자리다. `@NoSessionTouch()` 가 없으면 이 폴링이
 * `lastSeenAt` 을 계속 갱신하게 되어, 브라우저만 켜 두고 자리를 비운 사람도 영원히
 * "접속 중"으로 남는다. 에러는 나지 않으므로 관리자 화면의 접속자 목록이 근거를 잃었다는
 * 사실 자체를 아무도 알아채지 못한다.
 */
describe('ServerNoticesController.active 의 @NoSessionTouch 부착', () => {
  it('사용자용 active 엔드포인트에는 @NoSessionTouch 가 붙어 있다', () => {
    const touched = Reflect.getMetadata(
      NO_SESSION_TOUCH_KEY,
      ServerNoticesController.prototype.active,
    );
    expect(touched).toBe(true);
  });

  it('관리자용 컨트롤러에는 붙어 있지 않다 (예고 등록/취소는 정상적으로 접속 활동이어야 한다)', () => {
    const listTouched = Reflect.getMetadata(
      NO_SESSION_TOUCH_KEY,
      AdminServerNoticesController.prototype.list,
    );
    const createTouched = Reflect.getMetadata(
      NO_SESSION_TOUCH_KEY,
      AdminServerNoticesController.prototype.create,
    );
    const cancelTouched = Reflect.getMetadata(
      NO_SESSION_TOUCH_KEY,
      AdminServerNoticesController.prototype.cancel,
    );
    expect(listTouched).toBeUndefined();
    expect(createTouched).toBeUndefined();
    expect(cancelTouched).toBeUndefined();
  });
});
