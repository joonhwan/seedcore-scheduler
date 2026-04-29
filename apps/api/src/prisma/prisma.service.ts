import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');
    await this.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
