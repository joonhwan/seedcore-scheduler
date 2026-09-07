import { Controller, Get, UseGuards } from '@nestjs/common';
import { ACTIVE_SESSION_WINDOW_MS, type ActiveSessionsResponse } from '@sam/shared';
import { OriginGuard } from '../common/origin.guard';
import { AdminOnly, NoSessionTouch } from '../auth/auth.guard';
import { SessionsService } from './sessions.service';

@Controller('admin/sessions')
@UseGuards(OriginGuard)
@AdminOnly()
export class AdminSessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /**
   * 현재 접속자 목록.
   *
   * serverNow 를 함께 내려주는 것은 화면이 "몇 분 전"을 서버 시계 기준으로 계산하기
   * 위해서다. 관리자 PC 시계가 어긋나 있으면 상대 시간이 엉뚱하게 보인다.
   *
   * @NoSessionTouch 는 이 목록이 스스로를 관찰 대상에 넣지 않게 한다. 관리자 화면은 이
   * 자리를 30초마다 부르므로(useActiveSessions), 이 폴링을 활동으로 기록하면 화면을 켜
   * 두고 자리를 비운 관리자가 자기 목록에 영원히 "방금"으로 남는다. 사용자 쪽
   * /server-notices/active 에 같은 데코레이터를 붙인 이유와 같다.
   */
  @Get('active')
  @NoSessionTouch()
  async active(): Promise<ActiveSessionsResponse> {
    const now = new Date();
    const users = await this.sessions.listActiveUsers(now, ACTIVE_SESSION_WINDOW_MS);
    return { users, serverNow: now.toISOString() };
  }
}
