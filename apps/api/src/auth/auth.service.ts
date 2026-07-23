import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { validatePassword } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../common/rate-limit';

const FAILED_LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15분
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60 * 1000;

export interface LoginContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface LoginResult {
  sid: string;
  expiresAt: Date;
  passwordMustChange: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async hashPassword(plain: string): Promise<string> {
    // pure JS bcrypt 해싱 사용 (Air-gap Windows 단일 EXE 환경 호환)
    return bcrypt.hash(plain, 10);
  }

  private async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
        return await bcrypt.compare(plain, hash);
      }
      // fallback: 기존 bcrypt compare 시도
      return await bcrypt.compare(plain, hash);
    } catch (err) {
      this.logger.error('password verify failed', err);
      return false;
    }
  }

  async login(
    username: string,
    password: string,
    ctx: LoginContext,
  ): Promise<LoginResult> {
    const ipKey = `login:ip:${ctx.ip ?? 'unknown'}`;
    if (!this.rateLimit.check(ipKey, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)) {
      throw new UnauthorizedException({ error: 'RATE_LIMITED' });
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    const now = new Date();

    if (!user || !user.isActive) {
      await this.audit.log({
        actorId: user?.id ?? null,
        action: 'LOGIN_FAILURE',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { username, reason: !user ? 'NOT_FOUND' : 'INACTIVE' },
      });
      // 사용자 존재 여부 노출 방지 — 동일 메시지.
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS' });
    }

    let valid = false;
    valid = await this.verifyPassword(user.passwordHash, password);

    if (!valid) {
      const nextCount = user.failedLoginCount + 1;
      const shouldLock = false;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: nextCount,
          lockedUntil: null,
        },
      });
      await this.audit.log({
        actorId: user.id,
        action: 'LOGIN_FAILURE',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: {
          username,
          failedCount: nextCount,
          locked: false,
        },
      });
      throw new UnauthorizedException({ error: 'INVALID_CREDENTIALS' });
    }


    // 성공 — 카운터 초기화 + 자기 만료 세션 sweep + 새 세션 발급.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    });
    await this.sessions.sweepExpiredForUser(user.id);

    const session = await this.sessions.create({
      userId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      sid: session.sid,
      expiresAt: session.expiresAt,
      passwordMustChange: user.passwordMustChange,
    };
  }

  async logout(sid: string, actorId: string, ctx: LoginContext): Promise<void> {
    await this.sessions.destroy(sid);
    await this.audit.log({
      actorId,
      action: 'LOGOUT',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async changePassword(
    userId: string,
    current: string,
    next: string,
    ctx: LoginContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ error: 'NO_SESSION' });

    let valid = false;
    valid = await this.verifyPassword(user.passwordHash, current);
    if (!valid) {
      throw new ForbiddenException({ error: 'CURRENT_PASSWORD_INVALID' });
    }


    const policyError = validatePassword(next, user.username);
    if (policyError) {
      throw new BadRequestException({
        error: 'PASSWORD_POLICY_VIOLATION',
        reason: policyError,
      });
    }

    if (next === current) {
      throw new BadRequestException({ error: 'PASSWORD_REUSE' });
    }

    const hash = await this.hashPassword(next);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordMustChange: false,
      },
    });

    await this.audit.log({
      actorId: user.id,
      action: 'PASSWORD_CHANGE',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}
