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
  CreateProjectDto,
  UpdateProjectDto,
  type ProjectDetail,
  type ProjectListItem,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OriginGuard } from '../common/origin.guard';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { AdminOnly } from '../auth/auth.guard';
import { ProjectsService } from './projects.service';

@Controller()
@UseGuards(OriginGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  list(@Req() req: AuthenticatedRequest): Promise<ProjectListItem[]> {
    return this.projects.list({
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Get('projects/:id')
  get(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDetail> {
    return this.projects.getById(id, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Post('admin/projects')
  @AdminOnly()
  @UsePipes(new ZodValidationPipe(CreateProjectDto))
  create(
    @Body() body: CreateProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDetail> {
    return this.projects.create(body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Patch('admin/projects/:id')
  @AdminOnly()
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectDto)) body: UpdateProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDetail> {
    return this.projects.update(id, body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }

  @Delete('admin/projects/:id')
  @AdminOnly()
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.projects.hardDelete(id, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
