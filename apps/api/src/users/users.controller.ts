import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import {
  CreateUserDto,
  UpdateUserDto,
  type ResetPasswordResponse,
  type UserListItem,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { AdminOnly } from '../auth/auth.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(OriginGuard)
@AdminOnly()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query('query') query?: string,
    @Query('status') status?: 'active' | 'inactive' | 'all',
  ): Promise<UserListItem[]> {
    return this.users.list({ query, status });
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateUserDto))
  create(
    @Body() body: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserListItem> {
    return this.users.create(body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserDto)) body: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserListItem> {
    return this.users.update(id, body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResetPasswordResponse> {
    const temporaryPassword = await this.users.resetPassword(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    return { temporaryPassword };
  }

  @Post(':id/unlock')
  @HttpCode(204)
  async unlock(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.users.unlock(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
