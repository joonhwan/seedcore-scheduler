import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AddMemberDto, ProjectMemberItem } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertProjectReadAccess } from '../common/project-access';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 조회: 자기 자신이 멤버이거나 ADMIN 모드인 경우만.
   */
  async list(projectId: string, ctx: ActorContext): Promise<ProjectMemberItem[]> {
    await this.assertProjectExists(projectId);
    await assertProjectReadAccess(this.prisma, projectId, ctx);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, isActive: true },
        },
      },
      orderBy: [{ role: 'asc' }, { addedAt: 'asc' }],
    });

    return members.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      role: m.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      addedAt: m.addedAt.toISOString(),
    }));
  }

  /**
   * 추가: MANAGER+ 또는 ADMIN 모드. 기존 멤버면 409.
   */
  async add(
    projectId: string,
    body: AddMemberDto,
    ctx: ActorContext,
  ): Promise<ProjectMemberItem> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    const targetUser = await this.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, username: true, displayName: true, isActive: true },
    });
    if (!targetUser) {
      throw new BadRequestException({ error: 'USER_NOT_FOUND' });
    }
    if (!targetUser.isActive) {
      throw new BadRequestException({ error: 'USER_INACTIVE' });
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: body.userId } },
    });
    if (existing) {
      throw new ConflictException({ error: 'ALREADY_MEMBER' });
    }

    const created = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: body.userId,
        role: body.role,
        addedById: ctx.actorId,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'MEMBER_ADD',
      targetType: 'project_member',
      targetId: `${projectId}:${body.userId}`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { role: body.role },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project_member',
        targetId: `${projectId}:${body.userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'MEMBER_ADD' },
      });
    }

    return {
      userId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      role: body.role,
      addedAt: created.addedAt.toISOString(),
    };
  }

  /**
   * 제거: MANAGER+ 또는 ADMIN 모드. 마지막 MANAGER 제거 거부.
   */
  async remove(
    projectId: string,
    userId: string,
    ctx: ActorContext,
  ): Promise<void> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!target) {
      throw new NotFoundException({ error: 'NOT_A_MEMBER' });
    }

    if (target.role === 'MANAGER') {
      const remaining = await this.prisma.projectMember.count({
        where: { projectId, role: 'MANAGER', userId: { not: userId } },
      });
      if (remaining === 0) {
        throw new BadRequestException({ error: 'LAST_MANAGER' });
      }
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'MEMBER_REMOVE',
      targetType: 'project_member',
      targetId: `${projectId}:${userId}`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { previousRole: target.role },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project_member',
        targetId: `${projectId}:${userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'MEMBER_REMOVE' },
      });
    }
  }

  // ─── 내부 가드 ────────────────────────────────────────────────────────────

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
  }

  private async assertWriteAccess(
    projectId: string,
    ctx: ActorContext,
  ): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m || m.role !== 'MANAGER') {
      throw new ForbiddenException({ error: 'MANAGER_REQUIRED' });
    }
  }
}
