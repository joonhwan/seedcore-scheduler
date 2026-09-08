import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerNoticesService } from './server-notices.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

interface NoticeRow {
  id: string;
  kind: string;
  message: string;
  scheduledAt: Date;
  createdBy: string;
  createdAt: Date;
  canceledAt: Date | null;
  creator: { displayName: string };
}

const T0 = new Date('2026-09-07T09:00:00.000Z');
const later = (m: number) => new Date(T0.getTime() + m * 60 * 1000);

function notice(over: Partial<NoticeRow> = {}): NoticeRow {
  return {
    id: 'n1',
    kind: 'RESTART',
    message: '점검합니다',
    scheduledAt: later(30),
    createdBy: 'admin',
    createdAt: T0,
    canceledAt: null,
    creator: { displayName: '관리자' },
    ...over,
  };
}

/** 실제 DB 를 띄우는 통합 시험은 이 저장소에 없다(groups.service.test.ts 와 같은 방침). */
interface AuditRow {
  actorId: string | null;
  action: string;
  targetId: string;
}

function buildService(seed: NoticeRow[] = [], now = T0) {
  const rows = [...seed];
  // 감사로그도 함께 쌓는다. list() 가 "서버가 스스로 닫은 것" 을 이 기록으로 가리므로,
  // 목이 그것을 흉내내지 않으면 두 경로가 갈리는지 시험할 수 없다.
  const auditRows: AuditRow[] = [];

  const prismaObject = {
    serverNotice: {
      findMany: vi.fn(async (args?: { where?: { canceledAt?: null }; take?: number }) => {
        let out = rows;
        if (args?.where?.canceledAt === null) out = out.filter((r) => r.canceledAt === null);
        out = [...out].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return args?.take ? out.slice(0, args.take) : out;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) =>
        rows.find((r) => r.id === args.where.id) ?? null,
      ),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row = notice({
          ...(args.data as Partial<NoticeRow>),
          createdAt: now,
          creator: { displayName: '관리자' },
        });
        rows.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: { canceledAt: Date } }) => {
        const row = rows.find((r) => r.id === args.where.id)!;
        row.canceledAt = args.data.canceledAt;
        return row;
      }),
    },
    auditLog: {
      findMany: vi.fn(
        async (args: { where: { targetId: { in: string[] }; actorId: string | null } }) =>
          auditRows
            .filter(
              (a) =>
                a.actorId === args.where.actorId && args.where.targetId.in.includes(a.targetId),
            )
            .map((a) => ({ targetId: a.targetId })),
      ),
    },
  };

  const prisma = {
    ...prismaObject,
    // SQLite 는 Writer 가 하나뿐이라 실제로도 이 묶음이 순서를 확정한다. 목은 그저 콜백을
    // 그대로 불러 준다(members.service.test.ts 와 같은 방식).
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  } as unknown as PrismaService;

  const audit = {
    log: vi.fn(async (entry: { actorId: string | null; action: string; targetId?: string }) => {
      auditRows.push({
        actorId: entry.actorId,
        action: entry.action,
        targetId: entry.targetId ?? '',
      });
    }),
  } as unknown as AuditService;

  return { service: new ServerNoticesService(prisma, audit), prisma, audit, rows };
}

const ctx = { actorId: 'admin', ip: '10.0.0.1', userAgent: 'test' };

describe('active', () => {
  it('유효한 예고가 없으면 null 이다', async () => {
    const { service } = buildService([]);
    await expect(service.active()).resolves.toBeNull();
  });

  it('취소된 예고는 유효하지 않다', async () => {
    const { service } = buildService([notice({ canceledAt: T0 })]);
    await expect(service.active()).resolves.toBeNull();
  });

  it('예정 시각이 지나도 유효한 상태로 남는다', async () => {
    // 재시작이 늦어지는 사이에 팝업이 사라지면 사용자가 편집을 다시 시작해 작업을 잃는다.
    const { service } = buildService([notice({ scheduledAt: new Date(T0.getTime() - 60_000) })]);
    const out = await service.active();
    expect(out?.id).toBe('n1');
  });

  it('유효한 것이 여럿이면 가장 나중에 만든 것을 쓴다', async () => {
    const { service } = buildService([
      notice({ id: 'old', createdAt: new Date(T0.getTime() - 60_000) }),
      notice({ id: 'new', createdAt: T0 }),
    ]);
    const out = await service.active();
    expect(out?.id).toBe('new');
  });
});

describe('create', () => {
  const input = {
    kind: 'RESTART' as const,
    message: '점검합니다',
    scheduledAt: later(30).toISOString(),
  };

  // create() 만 실제 시계를 본다(scheduledAt > Date.now() 검사). 시계를 T0 에 고정하지
  // 않으면 T0 가 지난 다음 날부터 later(30) 이 과거가 되어 세 시험이 SCHEDULED_AT_IN_PAST
  // 로 깨진다. 시각만 가짜로 두고 타이머는 그대로 둔다 — prisma 대역의 비동기가 멈추면
  // 시험이 끝나지 않는다.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('유효한 예고가 없으면 등록한다', async () => {
    const { service, audit } = buildService([]);
    const out = await service.create(input, ctx);
    expect(out.message).toBe('점검합니다');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SERVER_NOTICE_CREATE' }),
    );
  });

  it('유효한 예고가 이미 있으면 409 로 거절한다', async () => {
    const { service } = buildService([notice()]);
    await expect(service.create(input, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it('확인과 삽입이 한 $transaction 안에서 일어난다', async () => {
    // 둘을 떼어 두면 두 관리자가 동시에 등록했을 때 양쪽 다 "유효한 예고 없음" 을 보고
    // 각자 행을 남긴다. 그러면 active() 는 나중 것만 돌려주므로 앞의 한 건은 취소할
    // 방법이 사라진 채 다음 기동까지 남는다.
    const { service, prisma } = buildService([]);
    await service.create(input, ctx);
    expect((prisma as unknown as { $transaction: unknown }).$transaction).toHaveBeenCalled();
  });

  it('지난 시각은 400 으로 거절한다', async () => {
    const { service } = buildService([]);
    await expect(
      service.create({ ...input, scheduledAt: new Date(Date.now() - 60_000).toISOString() }, ctx),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('cancel', () => {
  it('유효한 예고를 취소한다', async () => {
    const { service, audit } = buildService([notice()]);
    const out = await service.cancel('n1', ctx);
    expect(out.canceledAt).not.toBeNull();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SERVER_NOTICE_CANCEL' }),
    );
  });

  it('없는 예고는 404 다', async () => {
    const { service } = buildService([]);
    await expect(service.cancel('없음', ctx)).rejects.toMatchObject({ status: 404 });
  });

  it('이미 취소된 예고를 또 취소하면 409 다', async () => {
    const { service } = buildService([notice({ canceledAt: T0 })]);
    await expect(service.cancel('n1', ctx)).rejects.toMatchObject({ status: 409 });
  });
});

describe('list 의 canceledReason', () => {
  it('유효한 예고에는 사유가 없다', async () => {
    const { service } = buildService([notice()]);
    const out = await service.list();
    expect(out[0]!.canceledReason).toBeNull();
  });

  it('관리자가 취소한 것은 ADMIN 이다', async () => {
    const { service } = buildService([notice()]);
    await service.cancel('n1', ctx);
    const out = await service.list();
    expect(out[0]!.canceledReason).toBe('ADMIN');
  });

  it('서버가 기동하며 닫은 것은 SERVER_RESTART 다', async () => {
    // 이 구분이 없으면 관리자는 지난 기록의 "취소됨" 을 "누가 내 예고를 취소했다" 로 읽는다.
    const { service } = buildService([notice()]);
    await service.closeOpenNotices(later(60));
    const out = await service.list();
    expect(out[0]!.canceledReason).toBe('SERVER_RESTART');
  });
});

describe('closeOpenNotices', () => {
  // 서버가 다시 떴다는 것은 재시작이 끝났다는 뜻이다. 예고는 "이 서버가 곧 재시작된다" 는
  // 알림이고, 그 알림을 건 프로세스가 이미 죽었으므로 예정 시각이 미래든 과거든 근거가
  // 없어진다. 이 정리가 없으면 재시작이 끝났는데도 "곧 재시작됩니다" 가 사용자 화면에
  // 영원히 뜬다(관리자가 손으로 취소할 때까지).
  const NOW = later(60);

  it('예정 시각이 지난 예고를 닫는다', async () => {
    const { service, rows } = buildService([notice({ scheduledAt: later(30) })]);
    await expect(service.closeOpenNotices(NOW)).resolves.toBe(1);
    expect(rows[0]!.canceledAt).toEqual(NOW);
  });

  it('예정 시각이 아직 오지 않은 예고도 닫는다', async () => {
    // 재시작이 예정보다 일찍 끝나는 경우다. 12:30 예고를 걸고 12:25 에 껐다 켜면 그 예고는
    // 역할을 다했는데, 시각만 보고 남겨 두면 12:30 까지 팝업이 계속 뜨고 그 뒤로는
    // "곧 재시작됩니다" 로 굳는다.
    const { service, rows } = buildService([notice({ scheduledAt: later(120) })]);
    await expect(service.closeOpenNotices(NOW)).resolves.toBe(1);
    expect(rows[0]!.canceledAt).toEqual(NOW);
  });

  it('닫을 때 감사로그를 사람이 아닌 자동 처리로 남긴다', async () => {
    const { service, audit } = buildService([notice({ scheduledAt: later(30) })]);
    await service.closeOpenNotices(NOW);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVER_NOTICE_CANCEL',
        actorId: null,
        payload: expect.objectContaining({ reason: 'SERVER_RESTARTED' }),
      }),
    );
  });

  it('이미 취소된 예고는 건드리지 않는다', async () => {
    const { service, rows, audit } = buildService([
      notice({ scheduledAt: later(30), canceledAt: T0 }),
    ]);
    await expect(service.closeOpenNotices(NOW)).resolves.toBe(0);
    expect(rows[0]!.canceledAt).toEqual(T0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('닫을 것이 없으면 아무것도 하지 않는다', async () => {
    const { service, audit } = buildService([]);
    await expect(service.closeOpenNotices(NOW)).resolves.toBe(0);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
