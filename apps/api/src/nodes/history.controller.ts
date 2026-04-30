import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { NodeHistoryItem } from '@sam/shared';
import { OriginGuard } from '../common/origin.guard';
import { type AuthenticatedRequest } from '../common/request-context';
import { HistoryService } from './history.service';

@Controller()
@UseGuards(OriginGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('nodes/:id/history')
  forNode(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeHistoryItem[]> {
    return this.history.forNode(id, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
    });
  }
}
