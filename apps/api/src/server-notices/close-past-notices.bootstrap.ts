import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ServerNoticesService } from './server-notices.service';

/**
 * 서버가 기동할 때 지난 재시작 예고를 닫는다.
 *
 * 서버가 다시 떴다는 것 자체가 "재시작이 끝났다" 는 신호다. 이 정리가 없으면 예정 시각이
 * 지난 예고가 유효한 채로 남아, 재시작이 이미 끝났는데도 "곧 재시작됩니다" 가 사용자
 * 화면에 계속 뜬다 — 관리자가 손으로 취소할 때까지.
 *
 * 예약해 둔 미래 예고는 남는다(판정은 ServerNoticesService.closePastNotices 참고).
 */
@Injectable()
export class ClosePastNoticesBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClosePastNoticesBootstrap.name);

  constructor(private readonly notices: ServerNoticesService) {}

  async onApplicationBootstrap(): Promise<void> {
    const closed = await this.notices.closePastNotices(new Date());
    if (closed > 0) {
      this.logger.log(`Closed ${closed} past restart notice(s) — the restart is done.`);
    }
  }
}
