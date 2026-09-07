import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateServerNoticeDto, ServerNoticeView } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * 서버 공지(재시작 예고).
 *
 * 유효한 예고는 "취소되지 않은 것 중 가장 나중에 만든 것" 하나다. 예정 시각이 지나도 유효한
 * 상태로 남는다 — 재시작이 몇 분 늦어지는 사이에 팝업이 사라지면 사용자가 편집을 다시 시작해
 * 작업을 잃기 때문이다(설계 문서 §4.3).
 *
 * 등록·취소는 ADMIN 전용(@AdminOnly)이라 관리자 모드를 따로 보지 않는다. GroupsService 와
 * 같은 방침이다.
 */
export interface NoticeActorContext {
  actorId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

interface NoticeRowWithCreator {
  id: string;
  kind: string;
  message: string;
  scheduledAt: Date;
  createdBy: string;
  createdAt: Date;
  canceledAt: Date | null;
  creator: { displayName: string };
}

/** 지난 기록을 몇 건까지 돌려줄지. 폐쇄망 단일 서버라 페이지네이션까지 둘 이유가 없다. */
const HISTORY_LIMIT = 50;

@Injectable()
export class ServerNoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** 지금 유효한 예고. 없으면 null. */
  async active(): Promise<ServerNoticeView | null> {
    const rows = (await this.prisma.serverNotice.findMany({
      where: { canceledAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: { creator: { select: { displayName: true } } },
    })) as NoticeRowWithCreator[];

    const row = rows[0];
    return row ? this.toView(row) : null;
  }

  async list(): Promise<ServerNoticeView[]> {
    const rows = (await this.prisma.serverNotice.findMany({
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: { creator: { select: { displayName: true } } },
    })) as NoticeRowWithCreator[];

    return rows.map((r) => this.toView(r));
  }

  async create(
    input: CreateServerNoticeDto,
    ctx: NoticeActorContext,
  ): Promise<ServerNoticeView> {
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      // 등록하자마자 "곧 재시작됩니다" 상태로 들어가는 예고는 실수로 본다.
      throw new BadRequestException({ error: 'SCHEDULED_AT_IN_PAST' });
    }

    const current = await this.active();
    if (current) {
      throw new ConflictException({
        error: 'NOTICE_ALREADY_ACTIVE',
        currentNoticeId: current.id,
      });
    }

    const created = (await this.prisma.serverNotice.create({
      data: {
        id: randomUUID(),
        kind: input.kind,
        message: input.message,
        scheduledAt,
        createdBy: ctx.actorId,
      },
      include: { creator: { select: { displayName: true } } },
    })) as NoticeRowWithCreator;

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'SERVER_NOTICE_CREATE',
      targetType: 'server_notice',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { kind: created.kind, scheduledAt: created.scheduledAt.toISOString() },
    });

    return this.toView(created);
  }

  async cancel(id: string, ctx: NoticeActorContext): Promise<ServerNoticeView> {
    const found = (await this.prisma.serverNotice.findUnique({
      where: { id },
      include: { creator: { select: { displayName: true } } },
    })) as NoticeRowWithCreator | null;

    if (!found) throw new NotFoundException({ error: 'NOTICE_NOT_FOUND' });
    if (found.canceledAt !== null) {
      // 두 관리자가 동시에 취소를 누른 경우다. 앞선 취소를 덮어쓰지 않는다.
      throw new ConflictException({ error: 'NOTICE_ALREADY_CANCELED' });
    }

    const updated = (await this.prisma.serverNotice.update({
      where: { id },
      data: { canceledAt: new Date() },
      include: { creator: { select: { displayName: true } } },
    })) as NoticeRowWithCreator;

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'SERVER_NOTICE_CANCEL',
      targetType: 'server_notice',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { scheduledAt: updated.scheduledAt.toISOString() },
    });

    return this.toView(updated);
  }

  private toView(row: NoticeRowWithCreator): ServerNoticeView {
    return {
      id: row.id,
      kind: row.kind as ServerNoticeView['kind'],
      message: row.message,
      scheduledAt: row.scheduledAt.toISOString(),
      createdBy: row.createdBy,
      createdByName: row.creator.displayName,
      createdAt: row.createdAt.toISOString(),
      canceledAt: row.canceledAt === null ? null : row.canceledAt.toISOString(),
    };
  }
}
