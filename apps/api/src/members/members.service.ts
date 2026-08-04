import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AddMemberDto, ProjectMemberItem, UpdateMemberRoleDto } from '@sam/shared';
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

  /**
   * 역할 변경: MANAGER+ 또는 ADMIN 모드.
   * - MANAGER 는 자기 자신(userId === ctx.actorId)의 역할을 변경할 수 없음.
   * - ADMIN 모드인 ADMIN 은 자기 자신 포함 모든 사람 역할 변경 가능.
   * - MANAGER -> MEMBER 격상 시 마지막 MANAGER 면 거부 (LAST_MANAGER).
   */
  async updateRole(
    projectId: string,
    userId: string,
    body: UpdateMemberRoleDto,
    ctx: ActorContext,
  ): Promise<ProjectMemberItem> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    // ADMIN + adminMode 가 아닌 경우 자기 자신의 역할 변경 금지
    const isAdminOverride = ctx.globalRole === 'ADMIN' && ctx.adminMode === true;
    if (!isAdminOverride && userId === ctx.actorId) {
      throw new ForbiddenException({ error: 'CANNOT_CHANGE_SELF_ROLE' });
    }

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, isActive: true },
        },
      },
    });
    if (!target) {
      throw new NotFoundException({ error: 'NOT_A_MEMBER' });
    }

    if (target.role === body.role) {
      return {
        userId: target.user.id,
        username: target.user.username,
        displayName: target.user.displayName,
        role: target.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
        addedAt: target.addedAt.toISOString(),
      };
    }

    // MANAGER -> MEMBER 로 변경하는 경우 마지막 MANAGER 여부 검사
    if (target.role === 'MANAGER' && body.role === 'MEMBER') {
      const remaining = await this.prisma.projectMember.count({
        where: { projectId, role: 'MANAGER', userId: { not: userId } },
      });
      if (remaining === 0) {
        throw new BadRequestException({ error: 'LAST_MANAGER' });
      }
    }

    const updated = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role: body.role },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'MEMBER_ROLE_UPDATE',
      targetType: 'project_member',
      targetId: `${projectId}:${userId}`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { previousRole: target.role, newRole: body.role },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project_member',
        targetId: `${projectId}:${userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'MEMBER_ROLE_UPDATE' },
      });
    }

    return {
      userId: target.user.id,
      username: target.user.username,
      displayName: target.user.displayName,
      role: updated.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      addedAt: updated.addedAt.toISOString(),
    };
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
