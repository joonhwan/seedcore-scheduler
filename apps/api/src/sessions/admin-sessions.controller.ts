import { Controller, Get, UseGuards } from '@nestjs/common';
import { ACTIVE_SESSION_WINDOW_MS, type ActiveSessionsResponse } from '@sam/shared';
import { OriginGuard } from '../common/origin.guard';
import { AdminOnly } from '../auth/auth.guard';
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
   */
  @Get('active')
  async active(): Promise<ActiveSessionsResponse> {
    const now = new Date();
    const users = await this.sessions.listActiveUsers(now, ACTIVE_SESSION_WINDOW_MS);
    return { users, serverNow: now.toISOString() };
  }
}
