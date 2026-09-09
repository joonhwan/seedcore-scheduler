import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AddMemberDto,
  BulkAddMembersDto,
  BulkRemoveMembersDto,
  UpdateMemberRoleDto,
  type BulkAddMembersResult,
  type BulkRemoveMembersResult,
  type ProjectMemberItem,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import { getClientIp, getUserAgent, type AuthenticatedRequest } from '../common/request-context';
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

  @Post('bulk')
  addBulk(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(BulkAddMembersDto)) body: BulkAddMembersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkAddMembersResult> {
    return this.members.addBulk(projectId, body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  /**
   * 여러 명을 한꺼번에 뺀다.
   *
   * `:userId` 를 받는 경로보다 먼저 선언한다. 뒤에 두면 'bulk-remove' 가 userId 로 해석될
   * 여지가 생긴다 (DELETE 와 POST 라 지금은 겹치지 않지만, 추가 경로가 늘 때를 대비한다).
   */
  @Post('bulk-remove')
  @HttpCode(200)
  removeBulk(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(BulkRemoveMembersDto)) body: BulkRemoveMembersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkRemoveMembersResult> {
    return this.members.removeBulk(projectId, body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Patch(':userId')
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleDto)) body: UpdateMemberRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectMemberItem> {
    return this.members.updateRole(projectId, userId, body, {
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
