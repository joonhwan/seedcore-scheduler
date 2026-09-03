import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from './projects.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const T0 = new Date('2026-09-01T00:00:00.000Z');

interface UserRow {
  id: string;
  isActive: boolean;
}
interface PmRow {
  projectId: string;
  userId: string;
  role: 'MANAGER' | 'MEMBER';
  addedById: string;
  addedAt: Date;
}

/**
 * ProjectsService.create() 만 다루는 좁은 대역이다. members.service.test.ts /
 * groups.service.test.ts 와 같은 방식으로 user.findMany 의 where.isActive 를
 * 실제로 반영해야 INVALID_MANAGER_IDS / INVALID_MEMBER_IDS 분기를 볼 수 있다.
 */
function buildService(seed: { users?: UserRow[] } = {}) {
  const users = seed.users;
  const createdMembers: PmRow[] = [];

  const prismaObject = {
    user: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; isActive?: boolean };
        }) => {
          // seed.users 를 주지 않으면 요청받은 id 를 무조건 활성 사용자로 합성한다
          // (INVALID_*_IDS 분기를 보지 않는 기존 통과 경로 시험용).
          if (users === undefined) {
            return where.id.in.map((id) => ({ id }));
          }
          return where.id.in
            .map((id) => users.find((u) => u.id === id))
            .filter(
              (u): u is UserRow =>
                u !== undefined &&
                (where.isActive === undefined || u.isActive === where.isActive),
            )
            .map((u) => ({ id: u.id }));
        },
      ),
    },
    project: {
      create: vi.fn(async ({ data }: { data: { id: string; name: string; description: string | null; status: string; createdById: string } }) => ({
        ...data,
        createdAt: T0,
        updatedAt: T0,
      })),
    },
    projectMember: {
      createMany: vi.fn(async ({ data }: { data: PmRow[] }) => {
        createdMembers.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };

  const prisma = prismaObject as unknown as PrismaService;
  const audit = { log: vi.fn(async () => {}) } as unknown as AuditService;
  return {
    service: new ProjectsService(prisma, audit),
    audit,
    createdMembers,
    prismaObject,
  };
}

const CTX = { actorId: 'admin-1', globalRole: 'ADMIN' as const, adminMode: false };

describe('ProjectsService.create', () => {
  it('MANAGER 로도 지정된 사람은 MEMBER 목록에서 빠진다 (MANAGER 가 이긴다)', async () => {
    const { service, createdMembers } = buildService();
    await service.create(
      {
        name: 'proj',
        
        managerUserIds: ['u1'],
        memberUserIds: ['u1', 'u2'],
      },
      CTX,
    );
    const roles = createdMembers.map((m) => ({ userId: m.userId, role: m.role }));
    expect(roles).toEqual(
      expect.arrayContaining([
        { userId: 'u1', role: 'MANAGER' },
        { userId: 'u2', role: 'MEMBER' },
      ]),
    );
    expect(createdMembers).toHaveLength(2);
  });

  it('memberUserIds 에 비활성 사용자가 섞이면 INVALID_MEMBER_IDS 로 거부한다', async () => {
    const { service } = buildService({
      users: [
        { id: 'u1', isActive: true },
        { id: 'u2', isActive: false },
      ],
    });
    await expect(
      service.create(
        { name: 'proj',  managerUserIds: ['u1'], memberUserIds: ['u2'] },
        CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'INVALID_MEMBER_IDS', missing: ['u2'] } });
  });

  it('memberUserIds 에 존재하지 않는 사용자가 섞이면 INVALID_MEMBER_IDS 로 거부한다', async () => {
    const { service } = buildService({ users: [{ id: 'u1', isActive: true }] });
    await expect(
      service.create(
        { name: 'proj',  managerUserIds: ['u1'], memberUserIds: ['ghost'] },
        CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'INVALID_MEMBER_IDS', missing: ['ghost'] } });
  });

  it('memberUserIds 를 보내지 않은 기존 형태의 호출도 그대로 동작한다', async () => {
    const { service, createdMembers, audit } = buildService();
    const result = await service.create(
      { name: 'proj',  managerUserIds: ['u1'], memberUserIds: [] },
      CTX,
    );
    expect(result.name).toBe('proj');
    expect(createdMembers).toEqual([
      expect.objectContaining({ userId: 'u1', role: 'MANAGER' }),
    ]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_CREATE',
        payload: expect.objectContaining({ managerUserIds: ['u1'], memberUserIds: [] }),
      }),
    );
  });

  it('managerUserIds 가 비면 MANAGER_REQUIRED', async () => {
    const { service } = buildService();
    await expect(
      service.create({ name: 'proj',  managerUserIds: [], memberUserIds: [] }, CTX),
    ).rejects.toMatchObject({ response: { error: 'MANAGER_REQUIRED' } });
  });
});
