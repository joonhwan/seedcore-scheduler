import { describe, expect, it, vi } from 'vitest';
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
function buildService(seed: NoticeRow[] = [], now = T0) {
  const rows = [...seed];

  const prisma = {
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
  } as unknown as PrismaService;

  const audit = { log: vi.fn(async () => undefined) } as unknown as AuditService;
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
