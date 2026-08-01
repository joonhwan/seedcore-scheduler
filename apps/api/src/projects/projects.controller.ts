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
  CloneProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
  type CloneProjectResult,
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

  /**
   * 프로젝트 복제. 기존 프로젝트 생성(POST admin/projects)과 같은 권한 정책이다.
   *
   * @UsePipes 를 쓰지 않는 이유: path param(:id)에도 적용되어 body 스키마로 UUID 를
   * 검증하려 든다. 반드시 @Body 에 파이프를 직접 붙인다.
   */
  @Post('admin/projects/:id/clone')
  @AdminOnly()
  clone(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CloneProjectDto)) body: CloneProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CloneProjectResult> {
    return this.projects.clone(id, body, {
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
