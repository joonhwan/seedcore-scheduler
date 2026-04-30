import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode 는 결과 행을 반환하므로 $queryRawUnsafe 사용.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    await this.$queryRawUnsafe('PRAGMA foreign_keys=ON;');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
