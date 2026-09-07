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

    // 확인과 삽입을 한 트랜잭션으로 묶는다.
    //
    // 둘을 떼어 두면 두 관리자가 동시에 등록 버튼을 눌렀을 때 양쪽 다 "유효한 예고 없음"을
    // 보고 각자 행을 남긴다. 그러면 active() 는 나중 것만 돌려주므로 앞의 한 건은 취소할
    // 방법이 사라지고, 다음 기동 때 closeOpenNotices 가 치울 때까지 남는다. SQLite 는
    // Writer 가 하나뿐이라 이 묶음만으로 순서가 확정된다.
    const created = await this.prisma.$transaction(async (tx) => {
      const open = (await tx.serverNotice.findMany({
        where: { canceledAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })) as Array<Pick<NoticeRowWithCreator, 'id'>>;

      const current = open[0];
      if (current) {
        throw new ConflictException({
          error: 'NOTICE_ALREADY_ACTIVE',
          currentNoticeId: current.id,
        });
      }

      return (await tx.serverNotice.create({
        data: {
          id: randomUUID(),
          kind: input.kind,
          message: input.message,
          scheduledAt,
          createdBy: ctx.actorId,
        },
        include: { creator: { select: { displayName: true } } },
      })) as NoticeRowWithCreator;
    });

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

  /**
   * 서버가 기동할 때 부른다 — 취소되지 않은 예고를 모두 닫는다.
   *
   * 서버가 다시 떴다는 것은 재시작이 끝났다는 뜻이다. 예고는 "이 서버가 곧 재시작된다" 는
   * 알림이고, 그 알림을 건 프로세스가 이미 죽었으므로 **예정 시각이 미래든 과거든 근거가
   * 없어진다.** 이 정리가 없으면 재시작이 끝났는데도 "곧 재시작됩니다" 가 사용자 화면에
   * 계속 뜬다(관리자가 손으로 취소할 때까지). 설계는 "서버가 꺼질 때까지 유지"를 뜻했으나,
   * 서버가 다시 켜지면 화면도 다시 붙는다는 것을 놓쳤다.
   *
   * **예정 시각으로 걸러내지 않는 것이 중요하다.** 지난 것만 닫으면 재시작이 예정보다 일찍
   * 끝난 경우를 놓친다 — 12:30 예고를 걸고 12:25 에 껐다 켜면 그 예고는 역할을 다했는데도
   * 12:30 까지 팝업이 뜨고 그 뒤로는 "곧 재시작됩니다" 로 굳는다.
   *
   * 그래서 예약해 둔 먼 미래 예고도 함께 닫힌다. 관리자가 다시 걸어야 하지만, 재시작을
   * 겪은 예고를 살려 두는 쪽이 더 혼란스럽다는 판단이다.
   *
   * 감사로그는 사람이 취소한 것과 같은 액션을 쓰되 actorId 를 비우고 이유를 남긴다.
   * 그 기록이 곧 "서버가 실제로 언제 재시작되었는가" 이므로 확정명세 ⑤ 의 추적 목적에
   * 오히려 보탬이 된다.
   *
   * @returns 닫은 예고 수
   */
  async closeOpenNotices(now: Date): Promise<number> {
    // 여기서는 creator 를 include 하지 않으므로 NoticeRowWithCreator 로 단언하면 거짓말이
    // 된다. 지금은 id 와 scheduledAt 만 읽어 무해하지만, 누가 이 반복문에서 toView(t) 를
    // 부르는 순간 displayName 이 undefined 인 채로 터진다. 실제로 조회하는 두 필드만
    // 가져오고, 단언도 거기에 맞춘다.
    const targets = (await this.prisma.serverNotice.findMany({
      where: { canceledAt: null },
      select: { id: true, scheduledAt: true },
    })) as Array<Pick<NoticeRowWithCreator, 'id' | 'scheduledAt'>>;

    for (const t of targets) {
      await this.prisma.serverNotice.update({
        where: { id: t.id },
        data: { canceledAt: now },
      });
      await this.audit.log({
        actorId: null,
        action: 'SERVER_NOTICE_CANCEL',
        targetType: 'server_notice',
        targetId: t.id,
        payload: {
          reason: 'SERVER_RESTARTED',
          scheduledAt: t.scheduledAt.toISOString(),
        },
      });
    }

    return targets.length;
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
