import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { groupPathOfUser } from '@sam/shared';
import type {
  AddMemberDto,
  BulkAddMembersDto,
  BulkAddMembersResult,
  ProjectMemberItem,
  UpdateMemberRoleDto,
} from '@sam/shared';
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

    const groupInfo = await this.groupPathMap(members.map((m) => m.user.id));

    return members.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      role: m.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      addedAt: m.addedAt.toISOString(),
      ...(groupInfo.get(m.user.id) ?? { groupName: null, groupPath: [] }),
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

    const groupInfo = await this.groupPathMap([targetUser.id]);

    return {
      userId: targetUser.id,
      username: targetUser.username,
      displayName: targetUser.displayName,
      role: body.role,
      addedAt: created.addedAt.toISOString(),
      ...(groupInfo.get(targetUser.id) ?? { groupName: null, groupPath: [] }),
    };
  }

  /**
   * 여러 명을 한꺼번에 넣는다.
   *
   * 개별 추가 API 를 여러 번 부르면 중간에 하나가 실패했을 때 절반만 들어간 상태로 남으므로
   * 트랜잭션 하나로 처리한다. 이미 멤버인 사람은 오류로 만들지 않고 건너뛴다 — 그룹으로 담은
   * 명단에는 이미 들어 있는 사람이 섞이는 것이 정상이기 때문이다.
   */
  async addBulk(
    projectId: string,
    body: BulkAddMembersDto,
    ctx: ActorContext,
  ): Promise<BulkAddMembersResult> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    // 같은 사람이 두 번 실려 오면 뒤엣것을 버린다.
    const wanted = new Map<string, 'MANAGER' | 'MEMBER'>();
    for (const m of body.members) {
      if (!wanted.has(m.userId)) wanted.set(m.userId, m.role);
    }
    const userIds = [...wanted.keys()];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      const ok = new Set(users.map((u) => u.id));
      throw new BadRequestException({
        error: 'INVALID_MEMBER_IDS',
        missing: userIds.filter((id) => !ok.has(id)),
      });
    }

    const existing = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: userIds } },
      select: { userId: true },
    });
    const already = new Set(existing.map((m) => m.userId));
    const toAdd = userIds.filter((id) => !already.has(id));

    if (toAdd.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.projectMember.createMany({
          data: toAdd.map((userId) => ({
            projectId,
            userId,
            role: wanted.get(userId)!,
            addedById: ctx.actorId,
          })),
        });
      });
    }

    for (const userId of toAdd) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'MEMBER_ADD',
        targetType: 'project_member',
        targetId: `${projectId}:${userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { role: wanted.get(userId) },
      });
    }
    if (ctx.adminMode && toAdd.length > 0) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: projectId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'MEMBER_ADD_BULK', count: toAdd.length },
      });
    }

    return {
      added: toAdd.length,
      skipped: already.size,
      skippedUserIds: [...already],
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
      const groupInfo = await this.groupPathMap([target.user.id]);
      return {
        userId: target.user.id,
        username: target.user.username,
        displayName: target.user.displayName,
        role: target.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
        addedAt: target.addedAt.toISOString(),
        ...(groupInfo.get(target.user.id) ?? { groupName: null, groupPath: [] }),
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

    const groupInfo = await this.groupPathMap([target.user.id]);

    return {
      userId: target.user.id,
      username: target.user.username,
      displayName: target.user.displayName,
      role: updated.role === 'MANAGER' ? 'MANAGER' : 'MEMBER',
      addedAt: updated.addedAt.toISOString(),
      ...(groupInfo.get(target.user.id) ?? { groupName: null, groupPath: [] }),
    };
  }

  // ─── 내부 가드 ────────────────────────────────────────────────────────────

  /**
   * 주어진 사용자들의 소속 경로를 한꺼번에 읽어 맵으로 돌려준다.
   *
   * 화면(사용자 관리·명단 편집기)이 쓰는 것과 **같은 groupPathOfUser 함수**로 만든다.
   * 그래야 서버가 내려준 경로와 화면이 계산한 경로가 어긋나지 않는다.
   *
   * 그룹은 수십 개, 멤버는 프로젝트당 수십 명 규모라 질의 둘을 더하는 부담이 없다.
   *
   * 경로의 마지막 원소(groupName)를 꺼내는 계산까지 여기서 한 번에 처리한다 —
   * list · add · updateRole 세 곳이 같은 계산을 각자 복사하지 않도록 하기 위해서다.
   */
  private async groupPathMap(
    userIds: string[],
  ): Promise<Map<string, { groupName: string | null; groupPath: string[] }>> {
    const out = new Map<string, { groupName: string | null; groupPath: string[] }>();
    if (userIds.length === 0) return out;

    const [groups, memberRows] = await Promise.all([
      this.prisma.userGroup.findMany({
        select: { id: true, parentId: true, name: true },
      }),
      this.prisma.userGroupMember.findMany({
        where: { userId: { in: userIds } },
        select: { groupId: true, userId: true },
      }),
    ]);
    const memberships = memberRows.map((m) => ({
      groupId: m.groupId,
      userId: m.userId,
    }));
    for (const userId of userIds) {
      const groupPath = groupPathOfUser(groups, memberships, userId);
      out.set(userId, {
        groupPath,
        groupName: groupPath.length > 0 ? groupPath[groupPath.length - 1]! : null,
      });
    }
    return out;
  }

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
