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
interface GroupRow {
  id: string;
  parentId: string | null;
  name: string;
}
interface GroupMemberRow {
  groupId: string;
  userId: string;
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
    groups?: GroupRow[];
    groupMembers?: GroupMemberRow[];
  } = {},
) {
  const projectIds = seed.projectIds ?? ['p1'];
  const members = [...(seed.members ?? [])];
  const users = seed.users;
  const groups = [...(seed.groups ?? [])];
  const groupMembers = [...(seed.groupMembers ?? [])];

  // include: { user } 로 요청받았을 때 합성해 붙이는 유저 정보. groups.service.test.ts 와
  // 같은 방식 — username/displayName 은 이 시험군의 관심사가 아니므로 id 로부터 합성한다.
  // seed.users 가 주어졌으면 그 isActive 값을 반영한다(없으면 활성으로 간주).
  function userRowFor(id: string) {
    const u = users?.find((x) => x.id === id);
    return {
      id,
      username: id,
      displayName: `이름-${id}`,
      isActive: u ? u.isActive : true,
    };
  }

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
      // add() 가 단건 조회에 쓴다. seed.users 를 주면 그 isActive 를, 안 주면 활성으로 합성한다.
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (users !== undefined) {
          const u = users.find((x) => x.id === where.id);
          return u ? userRowFor(u.id) : null;
        }
        return userRowFor(where.id);
      }),
    },
    projectMember: {
      findMany: vi.fn(
        async (args: {
          where: { projectId: string; userId?: { in: string[] } };
          include?: { user?: unknown };
        }) => {
          const { where } = args;
          const filtered = members.filter(
            (m) =>
              m.projectId === where.projectId &&
              (where.userId === undefined || where.userId.in.includes(m.userId)),
          );
          // list() 는 include: { user } 로 유저 정보를 함께 요청한다. addBulk() 는 그러지
          // 않고 userId 만 필요로 하므로 기존 반환 모양(  { userId } 만 ) 을 그대로 둔다.
          if (args.include?.user) {
            return filtered.map((m) => ({ ...m, user: userRowFor(m.userId) }));
          }
          return filtered.map((m) => ({ userId: m.userId }));
        },
      ),
      findUnique: vi.fn(
        async (args: {
          where: { projectId_userId: { projectId: string; userId: string } };
          include?: { user?: unknown };
        }) => {
          const m = members.find(
            (x) =>
              x.projectId === args.where.projectId_userId.projectId &&
              x.userId === args.where.projectId_userId.userId,
          );
          if (!m) return null;
          if (args.include?.user) {
            return { ...m, user: userRowFor(m.userId) };
          }
          return m;
        },
      ),
      create: vi.fn(async ({ data }: { data: Omit<PmRow, 'addedAt'> }) => {
        const row: PmRow = { ...data, addedAt: T0 };
        members.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { projectId_userId: { projectId: string; userId: string } };
          data: Partial<PmRow>;
        }) => {
          const row = members.find(
            (m) =>
              m.projectId === where.projectId_userId.projectId &&
              m.userId === where.projectId_userId.userId,
          )!;
          Object.assign(row, data);
          return row;
        },
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: { projectId: string; role: 'MANAGER' | 'MEMBER'; userId?: { not: string } };
        }) =>
          members.filter(
            (m) =>
              m.projectId === where.projectId &&
              m.role === where.role &&
              (where.userId === undefined || m.userId !== where.userId.not),
          ).length,
      ),
      createMany: vi.fn(async ({ data }: { data: PmRow[] }) => {
        for (const row of data) members.push({ ...row, addedAt: T0 });
        return { count: data.length };
      }),
    },
    userGroup: {
      findMany: vi.fn(async () => groups),
    },
    userGroupMember: {
      // groupPathMap() 이 where.userId.in 으로 딱 필요한 사람만 읽는다. 대역이 이를
      // 무시하면 "소속 없음" 시험이 우연히 통과하므로 실제로 반영해야 한다.
      findMany: vi.fn(
        async ({ where }: { where: { userId: { in: string[] } } }) =>
          groupMembers
            .filter((m) => where.userId.in.includes(m.userId))
            .map((m) => ({ groupId: m.groupId, userId: m.userId })),
      ),
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

describe('MembersService 소속 그룹 채우기', () => {
  // 운영기술센터 > 기구완성팀. brief 의 예시 그대로.
  const GROUPS: GroupRow[] = [
    { id: 'g-top', parentId: null, name: '운영기술센터' },
    { id: 'g-sub', parentId: 'g-top', name: '기구완성팀' },
  ];
  const U1_MEMBER: PmRow = {
    projectId: 'p1',
    userId: 'u1',
    role: 'MEMBER',
    addedById: 'mgr-1',
    addedAt: T0,
  };

  it('소속이 있는 멤버에게 경로와 말단 이름을 채운다', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER, U1_MEMBER],
      groups: GROUPS,
      groupMembers: [{ groupId: 'g-sub', userId: 'u1' }],
    });
    const result = await service.list('p1', MANAGER_CTX);
    const u1 = result.find((m) => m.userId === 'u1');
    expect(u1?.groupName).toBe('기구완성팀');
    expect(u1?.groupPath).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('소속이 없는 멤버는 groupName 이 null 이고 groupPath 가 빈 배열이다', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER, U1_MEMBER],
      groups: GROUPS,
      groupMembers: [], // u1 은 그룹은 있지만 소속 행이 없다.
    });
    const result = await service.list('p1', MANAGER_CTX);
    const u1 = result.find((m) => m.userId === 'u1');
    expect(u1?.groupName).toBeNull();
    expect(u1?.groupPath).toEqual([]);
  });

  it('그룹이 하나도 없어도 목록이 정상으로 나온다', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER, U1_MEMBER],
      // groups·groupMembers 를 아예 주지 않는다 — 그룹 기능을 쓰지 않는 프로젝트.
    });
    const result = await service.list('p1', MANAGER_CTX);
    const u1 = result.find((m) => m.userId === 'u1');
    expect(u1?.groupName).toBeNull();
    expect(u1?.groupPath).toEqual([]);
  });

  it('add() 의 반환값에도 소속이 채워진다', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER],
      groups: GROUPS,
      groupMembers: [{ groupId: 'g-sub', userId: 'u1' }],
    });
    const result = await service.add('p1', { userId: 'u1', role: 'MEMBER' }, MANAGER_CTX);
    // 추가 직후 화면과 새로고침 뒤 화면(list())이 달라지면 안 된다.
    expect(result.groupName).toBe('기구완성팀');
    expect(result.groupPath).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('updateRole() 의 반환값에도 소속이 채워진다 (같은 역할 요청의 조기 반환 경로 포함)', async () => {
    const { service } = buildService({
      members: [MANAGER_MEMBER, U1_MEMBER],
      groups: GROUPS,
      groupMembers: [{ groupId: 'g-sub', userId: 'u1' }],
    });
    // U1_MEMBER 는 이미 MEMBER 이므로 같은 역할을 다시 요청 — updateRole() 의
    // "요청한 역할이 현재 역할과 같으면 그대로 돌아가는" 조기 반환 경로를 탄다.
    const result = await service.updateRole('p1', 'u1', { role: 'MEMBER' }, MANAGER_CTX);
    expect(result.groupName).toBe('기구완성팀');
    expect(result.groupPath).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('updateRole() 이 실제로 역할을 바꾸는 정상 경로에도 소속이 채워진다', async () => {
    const { service } = buildService({
      // mgr-1 이 이미 MANAGER 로 있으므로 u1 을 MANAGER 로 올려도(MEMBER -> MANAGER)
      // LAST_MANAGER 검사에 걸리지 않는다.
      members: [MANAGER_MEMBER, U1_MEMBER],
      groups: GROUPS,
      groupMembers: [{ groupId: 'g-sub', userId: 'u1' }],
    });
    // U1_MEMBER 는 MEMBER, 요청은 MANAGER — 역할이 실제로 바뀌므로 조기 반환이 아니라
    // prisma.projectMember.update() 를 거치는 최종 반환 경로를 탄다.
    const result = await service.updateRole('p1', 'u1', { role: 'MANAGER' }, MANAGER_CTX);
    expect(result.role).toBe('MANAGER');
    expect(result.groupName).toBe('기구완성팀');
    expect(result.groupPath).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('두 그룹에 걸친 소속이면 말단 이름의 가나다순 첫 번째를 고른다', async () => {
    const groups: GroupRow[] = [...GROUPS, { id: 'g-other', parentId: null, name: '가나다팀' }];
    const { service } = buildService({
      members: [MANAGER_MEMBER, U1_MEMBER],
      groups,
      groupMembers: [
        { groupId: 'g-sub', userId: 'u1' },
        { groupId: 'g-other', userId: 'u1' },
      ],
    });
    const result = await service.list('p1', MANAGER_CTX);
    const u1 = result.find((m) => m.userId === 'u1');
    // '가나다팀' 이 '기구완성팀' 보다 가나다순으로 앞선다 (groupPathOfUser 의 규칙).
    expect(u1?.groupName).toBe('가나다팀');
    expect(u1?.groupPath).toEqual(['가나다팀']);
  });
});
