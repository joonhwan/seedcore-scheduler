import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AddMemberDto, type ProjectMemberItem } from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { MembersService } from './members.service';

@Controller('projects/:projectId/members')
@UseGuards(OriginGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMemberItem[]> {
    return this.members.list(projectId, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post()
  add(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(AddMemberDto)) body: AddMemberDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMemberItem> {
    return this.members.add(projectId, body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.members.remove(projectId, userId, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
