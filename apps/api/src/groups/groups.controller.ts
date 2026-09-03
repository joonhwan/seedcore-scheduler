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
  UsePipes,
} from '@nestjs/common';
import {
  AddGroupMembersDto,
  CreateUserGroupDto,
  UpdateUserGroupDto,
  type GroupMemberItem,
  type UserGroupItem,
  type UserGroupTree,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import { getClientIp, getUserAgent, type AuthenticatedRequest } from '../common/request-context';
import { AdminOnly } from '../auth/auth.guard';
import { GroupsService } from './groups.service';

@Controller('admin/groups')
@UseGuards(OriginGuard)
@AdminOnly()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  tree(): Promise<UserGroupTree> {
    return this.groups.tree();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateUserGroupDto))
  create(
    @Body() body: CreateUserGroupDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserGroupItem> {
    return this.groups.create(body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserGroupDto)) body: UpdateUserGroupDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserGroupItem> {
    return this.groups.update(id, body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.groups.remove(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Get(':id/members')
  listMembers(@Param('id') id: string): Promise<GroupMemberItem[]> {
    return this.groups.listMembers(id);
  }

  @Post(':id/members')
  addMembers(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddGroupMembersDto)) body: AddGroupMembersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<GroupMemberItem[]> {
    return this.groups.addMembers(id, body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.groups.removeMember(id, userId, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
