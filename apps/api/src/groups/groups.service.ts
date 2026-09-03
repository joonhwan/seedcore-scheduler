import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MAX_GROUP_DEPTH,
  canReparentGroup,
  expandGroupMembers,
  groupDepthOf,
  type AddGroupMembersDto,
  type CreateUserGroupDto,
  type GroupMemberItem,
  type GroupNode,
  type UpdateUserGroupDto,
  type UserGroupItem,
  type UserGroupTree,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * 그룹 관리는 ADMIN 전용(@AdminOnly)이라 관리자 모드를 따로 보지 않는다.
 * 관리자 모드 분기는 "일반 사용자도 접근하는 자리에서 ADMIN 이 넘어설 때"를 위한 것인데,
 * 여기는 넘어설 대상이 없다. UsersService 와 같은 방침이다.
 */
export interface GroupActorContext {
  actorId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 그룹과 소속을 한 응답에 담아 돌려준다.
   * 둘을 따로 부르면 그 사이에 소속이 바뀌었을 때 화면의 미리보기 인원수가 실제와 어긋난다.
   */
  async tree(): Promise<UserGroupTree> {
    const [rows, memberRows] = await Promise.all([
      this.prisma.userGroup.findMany({ orderBy: [{ name: 'asc' }] }),
      this.prisma.userGroupMember.findMany({
        select: { groupId: true, userId: true },
      }),
    ]);

    const memberships = memberRows.map((m) => ({
      groupId: m.groupId,
      userId: m.userId,
    }));
    const nodes: GroupNode[] = rows.map((g) => ({ id: g.id, parentId: g.parentId }));

    const direct = new Map<string, number>();
    for (const m of memberships) {
      direct.set(m.groupId, (direct.get(m.groupId) ?? 0) + 1);
    }

    const groups: UserGroupItem[] = rows.map((g) => ({
      id: g.id,
      name: g.name,
      parentId: g.parentId,
      description: g.description,
      directMemberCount: direct.get(g.id) ?? 0,
      // 화면과 같은 함수로 센다. 한 사람이 여러 자손 그룹에 걸쳐 있어도 한 번만 세어진다.
      // 그룹이 수십 개 규모라 그룹마다 펼쳐도 부담이 없다.
      totalMemberCount: expandGroupMembers(nodes, memberships, [g.id]).length,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));

    return { groups, memberships };
  }

  async create(input: CreateUserGroupDto, ctx: GroupActorContext): Promise<UserGroupItem> {
    const rows = await this.prisma.userGroup.findMany();
    const nodes: GroupNode[] = rows.map((g) => ({ id: g.id, parentId: g.parentId }));

    if (input.parentId !== null) {
      if (!rows.some((g) => g.id === input.parentId)) {
        throw new BadRequestException({ error: 'GROUP_NOT_FOUND' });
      }
      const parentDepth = groupDepthOf(nodes, input.parentId);
      if (!Number.isFinite(parentDepth) || parentDepth + 1 > MAX_GROUP_DEPTH) {
        throw new BadRequestException({ error: 'GROUP_DEPTH_EXCEEDED' });
      }
    }

    await this.assertNameFree(input.parentId, input.name, null);

    const created = await this.prisma.userGroup.create({
      data: {
        id: randomUUID(),
        name: input.name,
        parentId: input.parentId,
        description: input.description,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'GROUP_CREATE',
      targetType: 'user_group',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { name: created.name, parentId: created.parentId },
    });

    // 갓 만든 그룹은 소속 인원도 하위 그룹도 있을 수 없으므로 0, 0 이 곧 사실이다.
    // (update() 는 기존 그룹을 고치는 것이라 실제로 세어야 한다 — 아래 update() 참고.)
    return this.toItem(created, 0, 0);
  }

  async update(
    id: string,
    input: UpdateUserGroupDto,
    ctx: GroupActorContext,
  ): Promise<UserGroupItem> {
    const rows = await this.prisma.userGroup.findMany();
    const current = rows.find((g) => g.id === id);
    if (!current) throw new NotFoundException({ error: 'GROUP_NOT_FOUND' });

    const nodes: GroupNode[] = rows.map((g) => ({ id: g.id, parentId: g.parentId }));
    const nextParentId = input.parentId !== undefined ? input.parentId : current.parentId;
    const nextName = input.name ?? current.name;

    if (input.parentId !== undefined && input.parentId !== current.parentId) {
      if (input.parentId !== null && !rows.some((g) => g.id === input.parentId)) {
        throw new BadRequestException({ error: 'GROUP_NOT_FOUND' });
      }
      const check = canReparentGroup(nodes, id, input.parentId);
      if (!check.ok) {
        throw new BadRequestException({
          error: check.reason === 'CYCLE' ? 'GROUP_CYCLE' : 'GROUP_DEPTH_EXCEEDED',
        });
      }
    }

    if (nextName !== current.name || nextParentId !== current.parentId) {
      await this.assertNameFree(nextParentId, nextName, id);
    }

    // exactOptionalPropertyTypes 때문에 undefined 를 그대로 넘기지 않고 조건부로 담는다.
    const data: {
      name?: string;
      parentId?: string | null;
      description?: string | null;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.parentId !== undefined) data.parentId = input.parentId;
    if (input.description !== undefined) data.description = input.description;

    const updated = await this.prisma.userGroup.update({ where: { id }, data });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'GROUP_UPDATE',
      targetType: 'user_group',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        before: { name: current.name, parentId: current.parentId },
        after: { name: updated.name, parentId: updated.parentId },
      },
    });

    // update() 는 기존 그룹을 고치는 것이라 create() 와 달리 0, 0 이 사실이 아닐 수 있다.
    // tree() 가 쓰는 것과 같은 방식(expandGroupMembers)으로 세어 화면 숫자와 어긋나지 않게 한다.
    // id 의 상위가 바뀌어도 id 아래의 부분 트리 자체는 그대로이므로 누계 인원수에는 영향이 없다.
    const memberRows = await this.prisma.userGroupMember.findMany({
      select: { groupId: true, userId: true },
    });
    const memberships = memberRows.map((m) => ({
      groupId: m.groupId,
      userId: m.userId,
    }));
    const directMemberCount = memberships.filter((m) => m.groupId === id).length;
    const totalMemberCount = expandGroupMembers(nodes, memberships, [id]).length;

    return this.toItem(updated, directMemberCount, totalMemberCount);
  }

  /**
   * 삭제는 소속 인원과 하위 그룹이 모두 없을 때만 허용한다.
   * 화면도 버튼을 비활성으로 두지만, 화면이 목록을 읽은 뒤 다른 관리자가 인원을 넣었을 수 있어
   * 최종 판정은 여기서 한다.
   */
  async remove(id: string, ctx: GroupActorContext): Promise<void> {
    const group = await this.prisma.userGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException({ error: 'GROUP_NOT_FOUND' });

    const [memberCount, childCount] = await Promise.all([
      this.prisma.userGroupMember.count({ where: { groupId: id } }),
      this.prisma.userGroup.count({ where: { parentId: id } }),
    ]);
    if (memberCount > 0 || childCount > 0) {
      throw new ConflictException({
        error: 'GROUP_NOT_EMPTY',
        memberCount,
        childCount,
      });
    }

    await this.prisma.userGroup.delete({ where: { id } });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'GROUP_DELETE',
      targetType: 'user_group',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { name: group.name, parentId: group.parentId },
    });
  }

  async listMembers(groupId: string): Promise<GroupMemberItem[]> {
    await this.assertGroupExists(groupId);
    const rows = await this.prisma.userGroupMember.findMany({
      where: { groupId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, isActive: true },
        },
      },
      orderBy: { addedAt: 'asc' },
    });
    return rows.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      isActive: m.user.isActive,
      addedAt: m.addedAt.toISOString(),
    }));
  }

  /**
   * 여러 명을 한꺼번에 넣는다.
   *
   * move 가 false(기본)인데 다른 그룹에 이미 속한 사람이 섞여 있으면 거부하고, 응답에 그
   * 사람들과 현재 소속을 담는다. 화면이 "옮기시겠습니까?" 확인 창을 띄우려면 그 정보가
   * 필요하기 때문이다. 승인하면 move: true 로 다시 부른다.
   */
  async addMembers(
    groupId: string,
    input: AddGroupMembersDto,
    ctx: GroupActorContext,
  ): Promise<GroupMemberItem[]> {
    await this.assertGroupExists(groupId);
    const userIds = Array.from(new Set(input.userIds));

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      const found = new Set(users.map((u) => u.id));
      throw new BadRequestException({
        error: 'USER_NOT_FOUND',
        missing: userIds.filter((id) => !found.has(id)),
      });
    }

    const existing = await this.prisma.userGroupMember.findMany({
      where: { userId: { in: userIds } },
      select: { groupId: true, userId: true },
    });
    const elsewhere = existing.filter((m) => m.groupId !== groupId);
    if (elsewhere.length > 0 && !input.move) {
      throw new ConflictException({
        error: 'GROUP_MEMBER_ALREADY_ASSIGNED',
        conflicts: elsewhere,
      });
    }

    const alreadyHere = new Set(
      existing.filter((m) => m.groupId === groupId).map((m) => m.userId),
    );
    const toAdd = userIds.filter((id) => !alreadyHere.has(id));
    const movedFrom = new Map(elsewhere.map((m) => [m.userId, m.groupId]));

    // 한 트랜잭션으로 묶는다. 빼기만 되고 넣기가 실패하면 소속이 사라진 채로 남는다.
    await this.prisma.$transaction(async (tx) => {
      if (elsewhere.length > 0) {
        await tx.userGroupMember.deleteMany({
          where: {
            OR: elsewhere.map((m) => ({ groupId: m.groupId, userId: m.userId })),
          },
        });
      }
      if (toAdd.length > 0) {
        await tx.userGroupMember.createMany({
          data: toAdd.map((userId) => ({
            groupId,
            userId,
            addedById: ctx.actorId,
          })),
        });
      }
    });

    // 이동은 REMOVE 와 ADD 두 건으로 남기고, 각 기록의 상세에 상대 그룹을 적어
    // 이동이었음을 알아볼 수 있게 한다. 별도의 GROUP_MEMBER_MOVE 는 만들지 않는다.
    for (const m of elsewhere) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'GROUP_MEMBER_REMOVE',
        targetType: 'user_group_member',
        targetId: `${m.groupId}:${m.userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { movedTo: groupId },
      });
    }
    for (const userId of toAdd) {
      const from = movedFrom.get(userId);
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'GROUP_MEMBER_ADD',
        targetType: 'user_group_member',
        targetId: `${groupId}:${userId}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: from !== undefined ? { movedFrom: from } : {},
      });
    }

    return this.listMembers(groupId);
  }

  async removeMember(
    groupId: string,
    userId: string,
    ctx: GroupActorContext,
  ): Promise<void> {
    await this.assertGroupExists(groupId);
    const row = await this.prisma.userGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!row) throw new NotFoundException({ error: 'GROUP_MEMBER_NOT_FOUND' });

    await this.prisma.userGroupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'GROUP_MEMBER_REMOVE',
      targetType: 'user_group_member',
      targetId: `${groupId}:${userId}`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {},
    });
  }

  // ─── 내부 ─────────────────────────────────────────────────────────────────

  private async assertGroupExists(groupId: string): Promise<void> {
    const exists = await this.prisma.userGroup.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException({ error: 'GROUP_NOT_FOUND' });
  }

  /**
   * 같은 상위 아래에 같은 이름이 있는지 본다.
   *
   * DB 의 @@unique([parentId, name]) 은 parentId 가 NULL 인 최상위끼리는 걸리지 않는다.
   * SQL 표준상 NULL 끼리는 같다고 보지 않기 때문이다. **이 검사가 유일한 방어선이다.**
   */
  private async assertNameFree(
    parentId: string | null,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const dup = await this.prisma.userGroup.findFirst({
      where: {
        parentId,
        name,
        ...(exceptId !== null ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (dup) throw new ConflictException({ error: 'GROUP_NAME_DUPLICATE' });
  }

  private toItem(
    row: {
      id: string;
      name: string;
      parentId: string | null;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    directMemberCount: number,
    totalMemberCount: number,
  ): UserGroupItem {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      description: row.description,
      directMemberCount,
      totalMemberCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
