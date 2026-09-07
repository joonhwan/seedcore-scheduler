import { Body, Controller, Get, Param, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { CreateServerNoticeDto, type ServerNoticeView } from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import { getClientIp, getUserAgent, type AuthenticatedRequest } from '../common/request-context';
import { AdminOnly } from '../auth/auth.guard';
import { ServerNoticesService } from './server-notices.service';

@Controller('admin/server-notices')
@UseGuards(OriginGuard)
@AdminOnly()
export class AdminServerNoticesController {
  constructor(private readonly notices: ServerNoticesService) {}

  @Get()
  list(): Promise<ServerNoticeView[]> {
    return this.notices.list();
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateServerNoticeDto))
  create(
    @Body() body: CreateServerNoticeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ServerNoticeView> {
    return this.notices.create(body, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ServerNoticeView> {
    return this.notices.cancel(id, {
      actorId: req.user!.id,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
