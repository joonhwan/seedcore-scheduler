import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
// 타입만 가져온다 — `import type` 은 컴파일 시 완전히 사라지므로 런타임 require 를 만들지 않는다.
// (아래 loadArgon2() 주석 참고: argon2 를 정적으로 임포트하면 단일 exe 빌드가 깨진다.)
import type * as Argon2 from 'argon2';
import { validatePassword } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../common/rate-limit';

/**
 * 저장된 해시가 옛 argon2id 포맷인지 본다.
 *
 * 커밋 017bca7(단일 exe 배포) 에서 해싱을 argon2 → bcrypt 로 바꿨는데, 그 전에 만들어진 계정의
 * 해시는 DB 에 argon2id 그대로 남아 있다. bcrypt.compare() 에 argon2 해시를 넣으면 예외도 없이
 * 그냥 false 가 나오므로, 판별 없이 검증하면 **어떤 비밀번호를 넣어도 로그인이 실패**한다.
 * 해시 문자열이 자기 알고리즘을 접두어로 갖고 있는 덕분에 한 컬럼에 두 포맷을 섞어둘 수 있다.
 */
function isLegacyArgon2Hash(hash: string): boolean {
  return hash.startsWith('$argon2');
}

/**
 * argon2 를 런타임에만, 실패해도 죽지 않게 불러온다.
 *
 * 정적 `import * as argon2 from 'argon2'` 로 바꾸면 안 된다. argon2 는 native 모듈(.node)이고
 * 배포판은 ncc 번들 + pkg 로 단일 exe 를 만드는데, 그 조합은 native 바이너리를 exe 안에 넣지
 * 못한다 — sp-reset-admin.exe 가 Prisma 쿼리 엔진을 못 찾아 통째로 실패한 것과 같은 원인이다.
 * 모듈 이름을 변수에 담아 require 하면 ncc 의 정적 분석이 이 의존성을 따라가지 못하므로,
 * 개발 환경(node_modules 있음)에서는 그대로 로드되고 exe 에서는 조용히 null 이 된다.
 *
 * exe 쪽에서 null 이어도 되는 이유: 아직 현장에 배포된 설치본이 없어 argon2 해시를 가진 DB 는
 * 개발 DB 뿐이다. 그래도 판단을 조용히 삼키지 않고 verifyPassword() 에서 로그로 남긴다.
 */
const ARGON2_MODULE_ID = 'argon2';
let argon2Cache: typeof Argon2 | null | undefined;
function loadArgon2(): typeof Argon2 | null {
  if (argon2Cache === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      argon2Cache = require(ARGON2_MODULE_ID) as typeof Argon2;
    } catch {
      argon2Cache = null;
    }
  }
  return argon2Cache;
}

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
      if (isLegacyArgon2Hash(hash)) {
        const argon2 = loadArgon2();
        if (!argon2) {
          // 여기서 조용히 false 를 돌려주면 "비밀번호가 틀렸다" 와 구분이 안 된다 —
          // 관리자가 원인을 찾을 단서를 반드시 남긴다.
          this.logger.error(
            '이 계정은 옛 argon2 해시로 저장돼 있는데 argon2 모듈을 불러올 수 없어 검증이 불가능합니다. ' +
              'sp-reset-admin.exe 로 비밀번호를 재설정하십시오.',
          );
          return false;
        }
        return await argon2.verify(hash, plain);
      }
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


    // 옛 argon2 해시로 로그인했다면 이 기회에 bcrypt 로 갈아둔다. 평문 비밀번호를 알 수 있는
    // 시점은 지금뿐이라, 로그인 순간을 놓치면 사용자에게 새 비밀번호를 받는 수밖에 없다.
    // 어차피 아래에서 카운터를 갱신하므로 UPDATE 한 번에 얹어 보낸다.
    const rehashedPassword = isLegacyArgon2Hash(user.passwordHash)
      ? await this.hashPassword(password)
      : undefined;

    // 성공 — 카운터 초기화 + 자기 만료 세션 sweep + 새 세션 발급.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        // exactOptionalPropertyTypes: true 라 undefined 를 그냥 넘길 수 없어 스프레드로 분기한다.
        ...(rehashedPassword !== undefined ? { passwordHash: rehashedPassword } : {}),
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
      // 해시 포맷을 갈아치운 사실은 감사로그에 남긴다 (새 action 을 만들지 않고 payload 로 —
      // AuditAction 은 @sam/shared 에 열거되어 있고 마이그레이션 CHECK 제약과 짝을 이룬다).
      ...(rehashedPassword !== undefined ? { payload: { passwordRehashed: 'argon2id->bcrypt' } } : {}),
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
