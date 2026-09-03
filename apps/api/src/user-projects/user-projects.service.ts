import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddUserProjectsDto,
  UpdateUserProjectRoleDto,
  UserGroupItem,
  UserProjectItem,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * 프로젝트 멤버를 사용자 기준으로 다룬다.
 *
 * 라우트는 @AdminOnly 지만 관리자 모드는 따로 본다. project_members 를 고치는 자리이므로
 * MembersService 와 같은 규칙을 지켜야 하기 때문이다 (AGENTS.md §4.4).
 */
export interface UserProjectActorContext {
  actorId: string;
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface AddUserProjectsResult {
  added: number;
  skipped: number;
  /** 이미 참여 중이라 건너뛴 프로젝트. */
  skippedProjectIds: string[];
}

@Injectable()
export class UserProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listProjects(userId: string): Promise<UserProjectItem[]> {
    await this.assertUserExists(userId);
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { addedAt: 'desc' },
    });
    return rows.map((m) => ({
      projectId: m.project.id,
      name: m.project.name,
      status: m.project.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      role: m.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      addedAt: m.addedAt.toISOString(),
    }));
  }

  /** 이 사람이 속한 그룹. 운영은 1인 1소속이라 보통 0개나 1개다. */
  async listGroups(userId: string): Promise<UserGroupItem[]> {
    await this.assertUserExists(userId);
    const rows = await this.prisma.userGroupMember.findMany({
      where: { userId },
      include: { group: true },
    });
    return rows.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      parentId: m.group.parentId,
      description: m.group.description,
      // 이 축에서는 인원수가 쓰이지 않는다. 화면은 그룹 목록 조회에서 받은 값을 쓴다.
      directMemberCount: 0,
      totalMemberCount: 0,
      createdAt: m.group.createdAt.toISOString(),
      updatedAt: m.group.updatedAt.toISOString(),
    }));
  }

  /**
   * 여러 프로젝트에 한 번에 넣는다.
   * 개별 추가 API 를 여러 번 부르면 중간 실패로 절반만 들어간 상태가 남으므로 트랜잭션 하나로
   * 처리하고, 이미 멤버인 사람은 건너뛰어 결과를 요약해 돌려준다.
   */
  async addProjects(
    userId: string,
    input: AddUserProjectsDto,
    ctx: UserProjectActorContext,
  ): Promise<AddUserProjectsResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    // MembersService.add 와 같은 규칙을 지킨다. 같은 테이블에 두 규칙이 생기면 안 된다.
    if (!user.isActive) throw new BadRequestException({ error: 'USER_INACTIVE' });

    const projectIds = Array.from(new Set(input.projectIds));

    const found = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true },
    });
    if (found.length !== projectIds.length) {
      const ok = new Set(found.map((p) => p.id));
      throw new BadRequestException({
        error: 'PROJECT_NOT_FOUND',
        missing: projectIds.filter((id) => !ok.has(id)),
      });
    }

    const existing = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const already = new Set(existing.map((m) => m.projectId));
    const toAdd = projectIds.filter((id) => !already.has(id));
    const skippedProjectIds = projectIds.filter((id) => already.has(id));

    if (toAdd.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.projectMember.createMany({
          data: toAdd.map((projectId) => ({
            projectId,
            userId,
            role: input.role,
            addedById: ctx.actorId,
          })),
        });
      });
    }

    // 사람마다 기존 MEMBER_ADD 를 남겨 프로젝트 이력에서도 추적되게 한다.
    for (const projectId of toAdd) {
      await this.logMemberChange('MEMBER_ADD', projectId, userId, { role: input.role }, ctx);
    }

    return { added: toAdd.length, skipped: skippedProjectIds.length, skippedProjectIds };
  }

  async updateRole(
    userId: string,
    projectId: string,
    input: UpdateUserProjectRoleDto,
    ctx: UserProjectActorContext,
  ): Promise<UserProjectItem> {
    // MembersService 와 같은 규칙: 관리자 모드가 아니면 자기 역할을 바꿀 수 없다.
    if (!ctx.adminMode && userId === ctx.actorId) {
      throw new ForbiddenException({ error: 'CANNOT_CHANGE_SELF_ROLE' });
    }

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!target) throw new NotFoundException({ error: 'NOT_A_MEMBER' });

    // MembersService.updateRole 과 같은 규칙: 역할이 그대로면 쓰지도 기록하지도 않는다.
    if (target.role === input.role) {
      const list = await this.listProjects(userId);
      return list.find((p) => p.projectId === projectId)!;
    }

    if (target.role === 'MANAGER' && input.role === 'MEMBER') {
      await this.assertNotLastManager(projectId, userId);
    }

    await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role: input.role },
    });

    await this.logMemberChange(
      'MEMBER_ROLE_UPDATE',
      projectId,
      userId,
      { previousRole: target.role, newRole: input.role },
      ctx,
    );

    const list = await this.listProjects(userId);
    return list.find((p) => p.projectId === projectId)!;
  }

  async removeProject(
    userId: string,
    projectId: string,
    ctx: UserProjectActorContext,
  ): Promise<void> {
    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!target) throw new NotFoundException({ error: 'NOT_A_MEMBER' });

    if (target.role === 'MANAGER') {
      await this.assertNotLastManager(projectId, userId);
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    await this.logMemberChange(
      'MEMBER_REMOVE',
      projectId,
      userId,
      { previousRole: target.role },
      ctx,
    );
  }

  // ─── 내부 ─────────────────────────────────────────────────────────────────

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
  }

  /** 관리자가 없는 프로젝트가 생기는 것을 막는다. MembersService 와 같은 규칙이다. */
  private async assertNotLastManager(projectId: string, userId: string): Promise<void> {
    const remaining = await this.prisma.projectMember.count({
      where: { projectId, role: 'MANAGER', userId: { not: userId } },
    });
    if (remaining === 0) throw new BadRequestException({ error: 'LAST_MANAGER' });
  }

  private async logMemberChange(
    action: 'MEMBER_ADD' | 'MEMBER_REMOVE' | 'MEMBER_ROLE_UPDATE',
    projectId: string,
    userId: string,
    payload: Record<string, unknown>,
    ctx: UserProjectActorContext,
  ): Promise<void> {
    await this.audit.log({
      actorId: ctx.actorId,
      action,
      targetType: 'project_member',
      targetId: `${projectId}:${userId}`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload,
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project_member',
        targetId: `${projectId}:${userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: action },
      });
    }
  }
}
