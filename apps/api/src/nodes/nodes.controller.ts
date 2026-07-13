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
  CreateNodeDto,
  MoveNodeDto,
  UpdateNodeDto,
  ImportCsvDto,
  type NodeTreeItem,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { NodesService } from './nodes.service';

@Controller()
@UseGuards(OriginGuard)
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get('projects/:projectId/nodes')
  list(
    @Param('projectId') projectId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeTreeItem[]> {
    return this.nodes.listTree(projectId, this.ctx(req));
  }

  @Post('projects/:projectId/nodes')
  create(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(CreateNodeDto)) body: CreateNodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeTreeItem> {
    return this.nodes.create(projectId, body, this.ctx(req));
  }

  @Patch('nodes/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNodeDto)) body: UpdateNodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeTreeItem> {
    return this.nodes.update(id, body, this.ctx(req));
  }

  @Post('nodes/:id/move')
  move(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveNodeDto)) body: MoveNodeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeTreeItem> {
    return this.nodes.move(id, body, this.ctx(req));
  }

  @Delete('nodes/:id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.nodes.hardDelete(id, this.ctx(req));
  }

  @Post('projects/:projectId/import-csv')
  importCsv(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(ImportCsvDto)) body: ImportCsvDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NodeTreeItem[]> {
    return this.nodes.importCsv(projectId, body, this.ctx(req));
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
