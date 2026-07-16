import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectHistoryQuery, type ProjectHistoryResponse } from '@sam/shared';
import { OriginGuard } from '../common/origin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type AuthenticatedRequest } from '../common/request-context';
import { ProjectHistoryService } from './project-history.service';

@Controller()
@UseGuards(OriginGuard)
export class ProjectHistoryController {
  constructor(private readonly service: ProjectHistoryService) {}

  @Get('projects/:id/history')
  forProject(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ProjectHistoryQuery)) query: ProjectHistoryQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectHistoryResponse> {
    return this.service.forProject(id, query, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
    });
  }
}
