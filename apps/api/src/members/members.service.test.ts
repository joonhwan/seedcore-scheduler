import { describe, expect, it, vi } from 'vitest';
import { MembersService } from './members.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const T0 = new Date('2026-09-01T00:00:00.000Z');

interface PmRow {
  projectId: string;
  userId: string;
  role: 'MANAGER' | 'MEMBER';
  addedById: string;
  addedAt: Date;
}
interface UserRow {
  id: string;
  isActive: boolean;
}

/**
 * 서비스가 실제로 부르는 질의 모양만 흉내 낸 좁은 대역이다.
 * groups.service.test.ts / user-projects.service.test.ts 와 같은 방식으로,
 * where 조건(특히 user.findMany 의 isActive)을 실제로 반영해야
 * INVALID_MEMBER_IDS 분기가 실행된다.
 */
function buildService(
  seed: {
    projectIds?: string[];
    members?: PmRow[];
    users?: UserRow[];
  } = {},
) {
  const projectIds = seed.projectIds ?? ['p1'];
  const members = [...(seed.members ?? [])];
  const users = seed.users;

  const prismaObject = {
    project: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        projectIds.includes(where.id) ? { id: where.id } : null,
      ),
    },
    user: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: { in: string[] }; isActive?: boolean };
        }) => {
          // seed.users 를 주지 않은 시험은 요청받은 id 를 무조건 활성 사용자로 합성하던
          // 기존 동작을 유지한다 (INVALID_MEMBER_IDS 분기를 보지 않는 기존 시험용).
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
    projectMember: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { projectId: string; userId: { in: string[] } };
        }) =>
          members
            .filter(
              (m) => m.projectId === where.projectId && where.userId.in.includes(m.userId),
            )
            .map((m) => ({ userId: m.userId })),
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { projectId_userId: { projectId: string; userId: string } };
        }) =>
          members.find(
            (m) =>
              m.projectId === where.projectId_userId.projectId &&
              m.userId === where.projectId_userId.userId,
          ) ?? null,
      ),
      createMany: vi.fn(async ({ data }: { data: PmRow[] }) => {
        for (const row of data) members.push({ ...row, addedAt: T0 });
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };

  const prisma = prismaObject as unknown as PrismaService;
  const audit = { log: vi.fn(async () => {}) } as unknown as AuditService;
  return { service: new MembersService(prisma, audit), audit, members, prismaObject };
}

// ADMIN + adminMode 는 assertWriteAccess 의 멤버십 검사를 건너뛴다.
const ADMIN_CTX = {
  actorId: 'admin-1',
  globalRole: 'ADMIN' as const,
  adminMode: true,
};
const MANAGER_CTX = {
  actorId: 'mgr-1',
  globalRole: 'USER' as const,
  adminMode: false,
};
const MANAGER_MEMBER: PmRow = {
  projectId: 'p1',
  userId: 'mgr-1',
  role: 'MANAGER',
  addedById: 'admin-1',
  addedAt: T0,
};

describe('MembersService.addBulk', () => {
  it('이미 멤버인 사람을 오류 없이 건너뛰고 added/skipped 를 정확히 돌려준다', async () => {
    const { service } = buildService({
      members: [
        MANAGER_MEMBER,
        { projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 },
      ],
    });
    const result = await service.addBulk(
      'p1',
      { members: [{ userId: 'u1', role: 'MEMBER' }, { userId: 'u2', role: 'MEMBER' }] },
      MANAGER_CTX,
    );
    expect(result).toEqual({ added: 1, skipped: 1, skippedUserIds: ['u1'] });
  });

  it('같은 사람이 두 번 실려 오면 한 번만 들어가고 앞엣것의 역할이 이긴다', async () => {
    const { service, members } = buildService({ members: [MANAGER_MEMBER] });
    await service.addBulk(
      'p1',
      {
        members: [
          { userId: 'u1', role: 'MANAGER' },
          { userId: 'u1', role: 'MEMBER' },
        ],
      },
      MANAGER_CTX,
    );
    const added = members.filter((m) => m.userId === 'u1');
    expect(added).toHaveLength(1);
    expect(added[0]!.role).toBe('MANAGER');
  });

  it('비활성·미존재 사용자가 섞이면 INVALID_MEMBER_IDS 로 거부하고 missing 에 담는다', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER],
      users: [
        { id: 'u1', isActive: true },
        { id: 'u2', isActive: false },
      ],
    });
    await expect(
      service.addBulk(
        'p1',
        {
          members: [
            { userId: 'u1', role: 'MEMBER' },
            { userId: 'u2', role: 'MEMBER' },
            { userId: 'ghost', role: 'MEMBER' },
          ],
        },
        MANAGER_CTX,
      ),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_MEMBER_IDS', missing: ['u2', 'ghost'] },
    });
  });

  it('삽입이 $transaction 안에서 일어난다', async () => {
    const { service, prismaObject } = buildService({ members: [MANAGER_MEMBER] });
    await service.addBulk('p1', { members: [{ userId: 'u1', role: 'MEMBER' }] }, MANAGER_CTX);
    expect(prismaObject.$transaction).toHaveBeenCalled();
    expect(prismaObject.projectMember.createMany).toHaveBeenCalled();
  });

  it('넣은 사람마다 MEMBER_ADD 감사로그를 남긴다', async () => {
    const { service, audit } = buildService({ members: [MANAGER_MEMBER] });
    await service.addBulk(
      'p1',
      {
        members: [
          { userId: 'u1', role: 'MEMBER' },
          { userId: 'u2', role: 'MANAGER' },
        ],
      },
      MANAGER_CTX,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMBER_ADD',
        targetId: 'p1:u1',
        payload: { role: 'MEMBER' },
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MEMBER_ADD',
        targetId: 'p1:u2',
        payload: { role: 'MANAGER' },
      }),
    );
  });

  it('관리자 모드일 때 ADMIN_OVERRIDE_EDIT 를 함께 남긴다', async () => {
    const { service, audit } = buildService();
    await service.addBulk('p1', { members: [{ userId: 'u1', role: 'MEMBER' }] }, ADMIN_CTX);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: 'p1',
        payload: { sub: 'MEMBER_ADD_BULK', count: 1 },
      }),
    );
  });

  it('관리자 모드가 아니면 ADMIN_OVERRIDE_EDIT 를 남기지 않는다', async () => {
    const { service, audit } = buildService({ members: [MANAGER_MEMBER] });
    await service.addBulk('p1', { members: [{ userId: 'u1', role: 'MEMBER' }] }, MANAGER_CTX);
    expect(audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_OVERRIDE_EDIT' }),
    );
  });

  it('넣을 사람이 하나도 없으면(전원이 이미 멤버) 쓰기도 감사로그도 일어나지 않는다', async () => {
    const { service, audit, prismaObject } = buildService({
      members: [
        MANAGER_MEMBER,
        { projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 },
      ],
    });
    const result = await service.addBulk(
      'p1',
      { members: [{ userId: 'u1', role: 'MEMBER' }] },
      MANAGER_CTX,
    );
    expect(result).toEqual({ added: 0, skipped: 1, skippedUserIds: ['u1'] });
    expect(prismaObject.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('관리자 모드라도 넣을 사람이 없으면 ADMIN_OVERRIDE_EDIT 도 남기지 않는다', async () => {
    const { service, audit } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 }],
    });
    await service.addBulk('p1', { members: [{ userId: 'u1', role: 'MEMBER' }] }, ADMIN_CTX);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('없는 프로젝트면 PROJECT_NOT_FOUND', async () => {
    const { service } = buildService({ projectIds: [] });
    await expect(
      service.addBulk('nope', { members: [{ userId: 'u1', role: 'MEMBER' }] }, ADMIN_CTX),
    ).rejects.toMatchObject({ response: { error: 'PROJECT_NOT_FOUND' } });
  });

  it('MANAGER 가 아닌 일반 멤버는 거부된다', async () => {
    const { service } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 }],
    });
    await expect(
      service.addBulk(
        'p1',
        { members: [{ userId: 'u2', role: 'MEMBER' }] },
        { actorId: 'u1', globalRole: 'USER', adminMode: false },
      ),
    ).rejects.toMatchObject({ response: { error: 'MANAGER_REQUIRED' } });
  });
});
