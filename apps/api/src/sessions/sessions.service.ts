import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SLIDING_MS = 30 * 60 * 1000; // 30분
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12시간

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
        expiresAt: new Date(now.getTime() + SLIDING_MS),
        ip: args.ip ?? null,
        userAgent: args.userAgent?.slice(0, 512) ?? null,
      },
    });
  }

  /**
   * sid 로 세션을 조회 + 만료 검사 + 슬라이딩 갱신.
   * 반환값이 null 이면 세션 무효 (삭제됨/만료됨/사용자 비활성).
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
    const absoluteDeadline = new Date(
      session.createdAt.getTime() + ABSOLUTE_MS,
    );

    if (now >= session.expiresAt || now >= absoluteDeadline || !session.user.isActive) {
      await this.prisma.session.delete({ where: { sid } }).catch(() => undefined);
      return null;
    }

    // sliding 갱신 (절대 만료 한도는 넘지 않게).
    const newExpiresAt = new Date(
      Math.min(now.getTime() + SLIDING_MS, absoluteDeadline.getTime()),
    );
    const updated = await this.prisma.session.update({
      where: { sid },
      data: { lastSeenAt: now, expiresAt: newExpiresAt },
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
