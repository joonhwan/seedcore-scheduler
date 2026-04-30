import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateProjectDto,
  ProjectDetail,
  ProjectListItem,
  ProjectRole,
  UpdateProjectDto,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 가시성 필터:
   *  - ADMIN + adminMode=true → 모든 프로젝트
   *  - 그 외 → 본인이 멤버인 프로젝트만
   */
  async list(ctx: ActorContext): Promise<ProjectListItem[]> {
    const isAdminBrowsing = ctx.globalRole === 'ADMIN' && ctx.adminMode;
    const projects = await this.prisma.project.findMany({
      where: isAdminBrowsing
        ? {}
        : { members: { some: { userId: ctx.actorId } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true } },
      },
      take: 500,
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: (p.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
        | 'ACTIVE'
        | 'ARCHIVED',
      myRole: roleOf(p.members[0]?.role ?? null),
      memberCount: p._count.members,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async getById(id: string, ctx: ActorContext): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true } },
      },
    });
    if (!project) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    const isMember = project.members.length > 0;
    const isAdminBrowsing = ctx.globalRole === 'ADMIN' && ctx.adminMode;
    if (!isMember && !isAdminBrowsing) {
      throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: (project.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
        | 'ACTIVE'
        | 'ARCHIVED',
      myRole: roleOf(project.members[0]?.role ?? null),
      memberCount: project._count.members,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      createdById: project.createdById,
    };
  }

  async create(input: CreateProjectDto, ctx: ActorContext): Promise<ProjectDetail> {
    const uniqueIds = Array.from(new Set(input.managerUserIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException({ error: 'MANAGER_REQUIRED' });
    }

    const found = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      const foundSet = new Set(found.map((u) => u.id));
      const missing = uniqueIds.filter((id) => !foundSet.has(id));
      throw new BadRequestException({
        error: 'INVALID_MANAGER_IDS',
        missing,
      });
    }

    const projectId = randomUUID();
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          id: projectId,
          name: input.name,
          description: input.description ?? null,
          status: 'ACTIVE',
          createdById: ctx.actorId,
        },
      });
      await tx.projectMember.createMany({
        data: uniqueIds.map((userId) => ({
          projectId: proj.id,
          userId,
          role: 'MANAGER',
          addedById: ctx.actorId,
          addedAt: now,
        })),
      });
      return proj;
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_CREATE',
      targetType: 'project',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        name: created.name,
        managerUserIds: uniqueIds,
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_CREATE' },
      });
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      status: 'ACTIVE',
      myRole: uniqueIds.includes(ctx.actorId) ? 'MANAGER' : null,
      memberCount: uniqueIds.length,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      createdById: created.createdById,
    };
  }

  async update(
    id: string,
    patch: UpdateProjectDto,
    ctx: ActorContext,
  ): Promise<ProjectDetail> {
    const target = await this.prisma.project.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    if (target.updatedAt.toISOString() !== patch.expectedUpdatedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Project has been modified by another user',
        currentUpdatedAt: target.updatedAt.toISOString(),
      });
    }

    const previousStatus = target.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
    const nextStatus = patch.status ?? previousStatus;

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.status !== undefined) data.status = patch.status;

    const updated = await this.prisma.project.update({
      where: { id },
      data,
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true } },
      },
    });

    if (patch.status !== undefined && previousStatus !== nextStatus) {
      const action =
        nextStatus === 'ARCHIVED' ? 'PROJECT_ARCHIVE' : 'PROJECT_RESTORE';
      await this.audit.log({
        actorId: ctx.actorId,
        action,
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } else {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'PROJECT_UPDATE',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined
            ? { description: patch.description }
            : {}),
        },
      });
    }
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_UPDATE' },
      });
    }

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: (updated.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
        | 'ACTIVE'
        | 'ARCHIVED',
      myRole: roleOf(updated.members[0]?.role ?? null),
      memberCount: updated._count.members,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      createdById: updated.createdById,
    };
  }

  /**
   * Hard delete. Project.status === 'ARCHIVED' 일 때만 가능.
   * 활성 프로젝트는 먼저 PATCH 로 ARCHIVED 전환 후 삭제.
   */
  async hardDelete(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.project.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
    if (target.status !== 'ARCHIVED') {
      throw new ConflictException({
        error: 'NOT_ARCHIVED',
        message: 'Archive the project (PATCH status=ARCHIVED) before deleting',
      });
    }

    // schema.prisma 의 onDelete: Cascade 가 members/nodes/comments/history 까지 처리.
    await this.prisma.project.delete({ where: { id } });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_DELETE',
      targetType: 'project',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { name: target.name },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_DELETE' },
      });
    }
  }
}

function roleOf(role: string | null): ProjectRole | null {
  if (role === 'MANAGER') return 'MANAGER';
  if (role === 'MEMBER') return 'MEMBER';
  return null;
}
