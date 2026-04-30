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
import { CreateCommentDto, type NodeCommentItem } from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { CommentsService } from './comments.service';

@Controller()
@UseGuards(OriginGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('nodes/:nodeId/comments')
  list(
    @Param('nodeId') nodeId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeCommentItem[]> {
    return this.comments.list(nodeId, this.ctx(req));
  }

  @Post('nodes/:nodeId/comments')
  add(
    @Param('nodeId') nodeId: string,
    @Body(new ZodValidationPipe(CreateCommentDto)) body: CreateCommentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeCommentItem> {
    return this.comments.add(nodeId, body, this.ctx(req));
  }

  @Delete('comments/:cid')
  @HttpCode(204)
  async remove(
    @Param('cid') cid: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.comments.remove(cid, this.ctx(req));
  }

  private ctx(req: AuthenticatedRequest) {
    return {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    };
  }
}
