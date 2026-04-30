import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from '@sam/shared';

export interface AuditEntry {
  actorId?: string | null | undefined;
  action: AuditAction;
  targetType?: string | null | undefined;
  targetId?: string | null | undefined;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
  payload?: unknown;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          payloadJson:
            entry.payload === undefined ? null : JSON.stringify(entry.payload),
        },
      });
    } catch (err) {
      // 감사 실패는 비즈니스를 막지 않는다.
      this.logger.error(`audit log failed: ${entry.action}`, err);
    }
  }
}
