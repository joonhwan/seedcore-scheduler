import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class InitialAdminBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(InitialAdminBootstrap.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const username = process.env.INITIAL_ADMIN_USERNAME;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!username || !password) {
      // 운영 권장 — 시딩 후 환경변수 제거.
      const adminCount = await this.prisma.user.count({
        where: { globalRole: 'ADMIN', isActive: true },
      });
      if (adminCount === 0) {
        this.logger.warn(
          'No active ADMIN exists and INITIAL_ADMIN_* env vars are not set. ' +
            '관리자 계정이 없습니다. INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD 를 설정 후 재기동하십시오.',
        );
      }
      return;
    }

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) {
      this.logger.log(
        `Initial admin '${username}' already exists — Skipping password seeding to preserve current password.`,
      );
      return;
    }

    const hash = await this.auth.hashPassword(password);
    await this.prisma.user.create({
      data: {
        id: randomUUID(),
        username,
        displayName: username,
        passwordHash: hash,
        passwordMustChange: true,
        globalRole: 'ADMIN',
        isActive: true,
      },
    });
    this.logger.warn(
      `Initial ADMIN '${username}' was seeded. 첫 로그인 시 비밀번호 변경이 강제됩니다. ` +
        `보안 권장: 환경에서 INITIAL_ADMIN_PASSWORD 를 제거하세요.`,
    );
  }
}
