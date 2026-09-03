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
  AddUserProjectsDto,
  UpdateUserProjectRoleDto,
  type UserGroupItem,
  type UserProjectItem,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import { getClientIp, getUserAgent, type AuthenticatedRequest } from '../common/request-context';
import { AdminOnly } from '../auth/auth.guard';
import { UserProjectsService, type AddUserProjectsResult } from './user-projects.service';

@Controller('admin/users/:userId')
@UseGuards(OriginGuard)
@AdminOnly()
export class UserProjectsController {
  constructor(private readonly userProjects: UserProjectsService) {}

  @Get('projects')
  listProjects(@Param('userId') userId: string): Promise<UserProjectItem[]> {
    return this.userProjects.listProjects(userId);
  }

  @Get('groups')
  listGroups(@Param('userId') userId: string): Promise<UserGroupItem[]> {
    return this.userProjects.listGroups(userId);
  }

  @Post('projects')
  addProjects(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(AddUserProjectsDto)) body: AddUserProjectsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AddUserProjectsResult> {
    return this.userProjects.addProjects(userId, body, this.ctx(req));
  }

  @Patch('projects/:projectId')
  updateRole(
    @Param('userId') userId: string,
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(UpdateUserProjectRoleDto))
    body: UpdateUserProjectRoleDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserProjectItem> {
    return this.userProjects.updateRole(userId, projectId, body, this.ctx(req));
  }

  @Delete('projects/:projectId')
  @HttpCode(204)
  async removeProject(
    @Param('userId') userId: string,
    @Param('projectId') projectId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.userProjects.removeProject(userId, projectId, this.ctx(req));
  }

  private ctx(req: AuthenticatedRequest) {
    return {
      actorId: req.user!.id,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    };
  }
}
