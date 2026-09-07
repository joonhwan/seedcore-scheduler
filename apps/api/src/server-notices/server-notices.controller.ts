import { Controller, Get } from '@nestjs/common';
import type { ActiveServerNoticeResponse } from '@sam/shared';
import { AllowPasswordChange, NoSessionTouch } from '../auth/auth.guard';
import { ServerNoticesService } from './server-notices.service';

@Controller('server-notices')
export class ServerNoticesController {
  constructor(private readonly notices: ServerNoticesService) {}

  /**
   * 사용자 화면이 주기적으로 부르는 자리.
   *
   * @NoSessionTouch 가 핵심이다. 이 폴링까지 활동으로 기록하면 브라우저만 켜 두고 자리를
   * 비운 사람도 영원히 접속 중으로 남아, 관리자 화면의 접속자 목록이 근거를 잃는다.
   *
   * @AllowPasswordChange 도 함께 필요하다. 첫 로그인이라 비밀번호를 바꿔야 하는 사용자는
   * 이 데코레이터가 없으면 이 폴링마다 403(PASSWORD_CHANGE_REQUIRED) 을 받아, 재시작
   * 예고를 끝내 보지 못한 채 서버가 내려간다.
   *
   * serverNow 를 함께 내려주는 것은 화면이 남은 시간을 서버 시계 기준으로 재기 위해서다.
   * scheduledAt 만 주면 시계가 3분 빠른 PC 는 재시작 2분 뒤에야 팝업을 보게 된다.
   */
  @Get('active')
  @NoSessionTouch()
  @AllowPasswordChange()
  async active(): Promise<ActiveServerNoticeResponse> {
    const notice = await this.notices.active();
    return { notice, serverNow: new Date().toISOString() };
  }
}
