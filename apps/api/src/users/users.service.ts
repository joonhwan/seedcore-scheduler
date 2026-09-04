import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  validatePassword,
  type UserActivitySummary,
  type UserListItem,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';

interface ActorContext {
  actorId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async list(args: {
    query?: string | undefined;
    status?: 'active' | 'inactive' | 'all' | undefined;
    includeRetired?: boolean | undefined;
  }): Promise<UserListItem[]> {
    const where: Record<string, unknown> = {};
    if (args.status === 'active') where.isActive = true;
    else if (args.status === 'inactive') where.isActive = false;
    // 재직 여부와 활성 여부는 독립한 축이다. 기본 화면에서는 퇴사자를 감춘다(확정명세 §6-나).
    if (!args.includeRetired) where.retiredAt = null;
    if (args.query && args.query.length > 0) {
      const q = args.query;
      where.OR = [
        { username: { contains: q } },
        { displayName: { contains: q } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return users.map(toUserListItem);
  }

  async create(
    input: { username: string; displayName: string; initialPassword: string },
    ctx: ActorContext,
  ): Promise<UserListItem> {
    const policyError = validatePassword(input.initialPassword, input.username);
    if (policyError) {
      throw new BadRequestException({
        error: 'PASSWORD_POLICY_VIOLATION',
        reason: policyError,
      });
    }

    const exists = await this.prisma.user.findUnique({
      where: { username: input.username },
    });
    if (exists) throw new ConflictException({ error: 'USERNAME_TAKEN' });

    const hash = await this.auth.hashPassword(input.initialPassword);
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        username: input.username,
        displayName: input.displayName,
        passwordHash: hash,
        passwordMustChange: true,
        globalRole: 'USER', // DESIGN §12-⑥: UI 는 USER 만 생성
        isActive: true,
      },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_CREATE',
      targetType: 'user',
      targetId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { username: user.username, displayName: user.displayName },
    });

    return toUserListItem(user);
  }

  async update(
    id: string,
    patch: { displayName?: string | undefined; isActive?: boolean | undefined },
    ctx: ActorContext,
  ): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    // 단일 ADMIN 비활성화 방지 — 활성 ADMIN 이 자기 자신밖에 없으면 거부.
    if (
      patch.isActive === false &&
      target.globalRole === 'ADMIN' &&
      target.isActive
    ) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          globalRole: 'ADMIN',
          isActive: true,
          id: { not: id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException({ error: 'LAST_ACTIVE_ADMIN' });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });

    if (patch.isActive === false && target.isActive) {
      const killed = await this.sessions.destroyAllForUser(id);
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_DEACTIVATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sessionsKilled: killed },
      });
    } else if (patch.isActive === true && !target.isActive) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_ACTIVATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } else if (patch.displayName !== undefined) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'USER_UPDATE',
        targetType: 'user',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { displayName: patch.displayName },
      });
    }

    return toUserListItem(updated);
  }

  async resetPassword(id: string, ctx: ActorContext): Promise<string> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    const temporary = generateTemporaryPassword();
    const hash = await this.auth.hashPassword(temporary);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: hash,
        passwordMustChange: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.sessions.destroyAllForUser(id);

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_PASSWORD_RESET',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return temporary;
  }

  async unlock(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_UNLOCK',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        previousLockedUntil: target.lockedUntil
          ? target.lockedUntil.toISOString()
          : null,
        previousFailedCount: target.failedLoginCount,
      },
    });
  }

  /**
   * 계정 하나가 남긴 활동을 센다.
   *
   * `client` 를 받는 이유는 삭제가 트랜잭션 안에서 이 함수를 다시 부르기 때문이다. 조회
   * 시점과 삭제 시점 사이에 그 사람이 프로젝트에 추가될 수 있으므로, 지우기 직전에 같은
   * 기준으로 한 번 더 센다(설계 문서 §5.3).
   *
   * 세는 것은 아홉 갈래다. `sessions` 는 계정을 지우면 Cascade 로 함께 사라지고,
   * `audit_logs` 는 행을 남긴 채 행위자만 비우므로 둘 다 세지 않는다(설계 문서 §5.1).
   */
  private async countActivity(
    id: string,
    client: Prisma.TransactionClient,
  ): Promise<{ summary: UserActivitySummary; total: number }> {
    const [
      projectMemberships,
      groupMemberships,
      createdProjects,
      nodesCreated,
      nodesUpdated,
      comments,
      history,
      membershipsAdded,
      groupMembersAdded,
    ] = await Promise.all([
      client.projectMember.count({ where: { userId: id } }),
      client.userGroupMember.count({ where: { userId: id } }),
      client.project.count({ where: { createdById: id } }),
      client.scheduleNode.count({ where: { createdById: id } }),
      client.scheduleNode.count({ where: { updatedById: id } }),
      client.nodeComment.count({ where: { authorId: id } }),
      client.nodeHistory.count({ where: { actorId: id } }),
      client.projectMember.count({ where: { addedById: id } }),
      client.userGroupMember.count({ where: { addedById: id } }),
    ]);

    const clearable = { projectMemberships, groupMemberships };
    const permanent = {
      createdProjects,
      nodesCreated,
      nodesUpdated,
      comments,
      history,
      membershipsAdded,
      groupMembersAdded,
    };
    const total =
      Object.values(clearable).reduce((a, b) => a + b, 0) +
      Object.values(permanent).reduce((a, b) => a + b, 0);

    return { summary: { canDelete: total === 0, clearable, permanent }, total };
  }

  async activity(id: string): Promise<UserActivitySummary> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    const { summary } = await this.countActivity(id, this.prisma);
    return summary;
  }

  /**
   * 퇴사 처리. **`retired_at` 과 `is_active` 를 반드시 함께 바꾼다.**
   *
   * `is_active` 를 보고 사람을 걸러내는 자리가 서버에 열다섯 군데 있다(로그인, 세션 검증,
   * 참여자 후보, 그룹 인원 추가 등). 함께 내리면 그 코드가 그대로 퇴사자를 막으므로 한 군데를
   * 빠뜨려 퇴사자가 참여자 후보에 뜨는 사고가 구조적으로 불가능해진다(설계 문서 §3).
   *
   * 그래서 `retired_at` 이 채워졌는데 `is_active = true` 인 조합은 만들지 않는다. 화면도
   * 퇴사자 행에서는 활성 토글을 감춘다.
   */
  async retire(id: string, ctx: ActorContext): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (id === ctx.actorId) {
      throw new BadRequestException({ error: 'SELF_ACTION_FORBIDDEN' });
    }
    if (target.retiredAt !== null) {
      throw new BadRequestException({ error: 'ALREADY_RETIRED' });
    }

    // 단일 ADMIN 보호 — update() 의 비활성화 금지와 같은 규칙이다.
    if (target.globalRole === 'ADMIN' && target.isActive) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { globalRole: 'ADMIN', isActive: true, id: { not: id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException({ error: 'LAST_ACTIVE_ADMIN' });
      }
    }

    // 감사로그에 남길 값이므로 바뀌기 전에 잡아 둔다.
    const wasActive = target.isActive;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { retiredAt: new Date(), isActive: false },
    });
    const sessionsKilled = await this.sessions.destroyAllForUser(id);

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_RETIRE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { wasActive, sessionsKilled },
    });

    return toUserListItem(updated);
  }

  /**
   * 복직. **항상 활성으로 되돌린다.**
   *
   * 퇴사 전에 비활성이던 사람이라면 관리자가 복직 후 다시 내리면 된다. 드문 경우를 위해
   * 전이를 복잡하게 만들지 않는다. 퇴사 직전의 상태는 USER_RETIRE 감사로그의 wasActive 에
   * 남아 있다.
   */
  async unretire(id: string, ctx: ActorContext): Promise<UserListItem> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (target.retiredAt === null) {
      throw new BadRequestException({ error: 'NOT_RETIRED' });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { retiredAt: null, isActive: true },
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_UNRETIRE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return toUserListItem(updated);
  }

  /**
   * 완전 삭제. 활동이 한 건도 없는 계정만 지운다.
   *
   * 감사로그는 **행을 남긴 채 행위자만 비운다.** 계정을 만들어 한 번 로그인하기만 해도
   * LOGIN_SUCCESS 가 남으므로, 그것을 활동으로 세면 지울 수 있는 계정이 사실상 없어져
   * "잘못 만든 계정을 정리한다"는 요청 취지를 절반만 채우게 된다(설계 문서 §3).
   * 세션은 users 행을 지우면 Cascade 로 함께 사라진다.
   *
   * 감사로그를 트랜잭션 밖에서 남기는 이유는, 삭제가 실패했는데 기록만 남는 일을 막기
   * 위함이다. 트랜잭션이 커밋된 뒤에만 기록된다.
   */
  async remove(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
    if (id === ctx.actorId) {
      throw new BadRequestException({ error: 'SELF_ACTION_FORBIDDEN' });
    }

    await this.prisma.$transaction(async (tx) => {
      // 화면이 집계를 읽은 뒤 삭제를 누르기까지 사이에 그 사람이 프로젝트에 추가될 수 있다.
      // 그래서 지우기 직전에 같은 기준으로 한 번 더 센다.
      const { total } = await this.countActivity(id, tx);
      if (total > 0) {
        throw new BadRequestException({ error: 'USER_HAS_ACTIVITY' });
      }

      await tx.auditLog.updateMany({
        where: { actorId: id },
        data: { actorId: null },
      });
      await tx.user.delete({ where: { id } });
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'USER_DELETE',
      targetType: 'user',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { username: target.username, displayName: target.displayName },
    });
  }
}

/**
 * Prisma 의 사용자 행을 API 응답으로 바꾼다.
 *
 * list·create·update·retire·unretire 다섯 곳이 같은 매핑을 하므로 한 곳에 모은다.
 * 필드가 하나 늘 때마다 다섯 곳을 고치다 한 곳을 빠뜨리는 일을 막기 위함이다.
 */
function toUserListItem(u: {
  id: string;
  username: string;
  displayName: string;
  globalRole: string;
  isActive: boolean;
  passwordMustChange: boolean;
  lockedUntil: Date | null;
  failedLoginCount: number;
  lastLoginAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
}): UserListItem {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    globalRole: u.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
    isActive: u.isActive,
    passwordMustChange: u.passwordMustChange,
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    failedLoginCount: u.failedLoginCount,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    retiredAt: u.retiredAt ? u.retiredAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * 임시 비밀번호 — 영문 대/소, 숫자, 특수 모두 1자 이상 포함, 12자.
 * 정책(10자 + 3종) 자동 충족.
 */
function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const special = '!@#$%^&*-_=+';
  const all = upper + lower + digit + special;

  const pick = (set: string): string => {
    const buf = randomBytes(1);
    return set[buf[0]! % set.length]!;
  };

  const required = [pick(upper), pick(lower), pick(digit), pick(special)];
  const remaining: string[] = [];
  while (required.length + remaining.length < 12) {
    remaining.push(pick(all));
  }
  const chars = [...required, ...remaining];

  // Fisher-Yates 셔플 (crypto.randomBytes).
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const r = randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[r]] = [chars[r]!, chars[i]!];
  }
  return chars.join('');
}
