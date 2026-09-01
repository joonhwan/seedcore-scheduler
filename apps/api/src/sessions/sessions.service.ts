import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Session } from '@prisma/client';
import { SESSION_TTL_MS } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionWithUser extends Session {
  user: {
    id: string;
    username: string;
    displayName: string;
    globalRole: string;
    passwordMustChange: boolean;
    isActive: boolean;
  };
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: {
    userId: string;
    ip?: string | null | undefined;
    userAgent?: string | null | undefined;
  }): Promise<Session> {
    const now = new Date();
    return this.prisma.session.create({
      data: {
        sid: randomUUID(),
        userId: args.userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        ip: args.ip ?? null,
        userAgent: args.userAgent?.slice(0, 512) ?? null,
      },
    });
  }

  /**
   * sid 로 세션을 조회 + 만료 검사 + 마지막 활동 시각 기록.
   * 반환값이 null 이면 세션 무효 (삭제됨/만료됨/사용자 비활성).
   *
   * 만료 시각(expiresAt)은 여기서 건드리지 않는다. 수명은 로그인 시점에 정해지고,
   * 연장은 사용자가 연장 창에서 명시적으로 누를 때(extend)만 일어난다 —
   * @sam/shared 의 SESSION_TTL_MS 주석 참고.
   * lastSeenAt 만 갱신하는 것은 관리자 화면의 접속자 목록이 쓸 근거를 남기기 위해서다.
   */
  async touch(sid: string): Promise<SessionWithUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { sid },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            globalRole: true,
            passwordMustChange: true,
            isActive: true,
          },
        },
      },
    });
    if (!session) return null;

    const now = new Date();

    if (now >= session.expiresAt || !session.user.isActive) {
      await this.prisma.session.delete({ where: { sid } }).catch(() => undefined);
      return null;
    }

    const updated = await this.prisma.session.update({
      where: { sid },
      data: { lastSeenAt: now },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            globalRole: true,
            passwordMustChange: true,
            isActive: true,
          },
        },
      },
    });
    return updated;
  }

  /**
   * 세션 수명을 지금부터 다시 SESSION_TTL_MS 만큼 늘린다 (연장 창의 "로그인 연장").
   *
   * 이미 만료됐거나 사라진 세션은 되살리지 않고 null 을 돌려준다. 연장 요청은 인증 가드를
   * 통과한 뒤에 오므로 정상 흐름에서는 살아 있지만, 만료 직전에 눌러 경합이 나는 경우가 있다.
   * 연장 횟수에는 제한을 두지 않는다 — 폐쇄망 단일 서버라는 전제에서 나온 결정이다.
   */
  async extend(sid: string): Promise<Session | null> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({ where: { sid } });
    if (!session || now >= session.expiresAt) return null;

    return this.prisma.session.update({
      where: { sid },
      data: {
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    });
  }

  async destroy(sid: string): Promise<void> {
    await this.prisma.session.delete({ where: { sid } }).catch(() => undefined);
  }

  async destroyAllForUser(userId: string): Promise<number> {
    const r = await this.prisma.session.deleteMany({ where: { userId } });
    return r.count;
  }

  /** 로그인 등 유저 액션 시 호출 — 만료된 자기 세션을 함께 정리. */
  async sweepExpiredForUser(userId: string): Promise<number> {
    const r = await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
    return r.count;
  }
}
