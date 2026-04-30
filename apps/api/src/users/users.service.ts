import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { validatePassword, type UserListItem } from '@sam/shared';
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
  }): Promise<UserListItem[]> {
    const where: Record<string, unknown> = {};
    if (args.status === 'active') where.isActive = true;
    else if (args.status === 'inactive') where.isActive = false;
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
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      globalRole: u.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
      isActive: u.isActive,
      passwordMustChange: u.passwordMustChange,
      lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
      failedLoginCount: u.failedLoginCount,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }));
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

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      globalRole: 'USER',
      isActive: user.isActive,
      passwordMustChange: user.passwordMustChange,
      lockedUntil: null,
      failedLoginCount: user.failedLoginCount,
      lastLoginAt: null,
      createdAt: user.createdAt.toISOString(),
    };
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

    return {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      globalRole: updated.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
      isActive: updated.isActive,
      passwordMustChange: updated.passwordMustChange,
      lockedUntil: updated.lockedUntil ? updated.lockedUntil.toISOString() : null,
      failedLoginCount: updated.failedLoginCount,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    };
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
