import {
  Body,
  Controller,
  Delete,
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
  BulkImportUsersDto,
  CreateUserDto,
  UpdateUserDto,
  type BulkImportResult,
  type ResetPasswordResponse,
  type UserActivitySummary,
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
    @Query('includeRetired') includeRetired?: string,
  ): Promise<UserListItem[]> {
    // 쿼리 파라미터는 항상 문자열이다. '1' 일 때만 참으로 본다.
    return this.users.list({ query, status, includeRetired: includeRetired === '1' });
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

  @Post('bulk-import')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(BulkImportUsersDto))
  bulkImport(
    @Body() body: BulkImportUsersDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkImportResult> {
    return this.users.bulkImport(body, {
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

  @Get(':id/activity')
  activity(@Param('id') id: string): Promise<UserActivitySummary> {
    return this.users.activity(id);
  }

  @Post(':id/retire')
  @HttpCode(200)
  retire(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserListItem> {
    return this.users.retire(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post(':id/unretire')
  @HttpCode(200)
  unretire(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserListItem> {
    return this.users.unretire(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.users.remove(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
