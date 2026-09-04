import { describe, expect, it, vi } from 'vitest';
import { GroupsService } from './groups.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

interface GroupRow {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface MemberRow {
  groupId: string;
  userId: string;
  addedById: string;
  addedAt: Date;
}
interface UserRow {
  id: string;
  isActive: boolean;
}

const T0 = new Date('2026-09-01T00:00:00.000Z');

function group(id: string, parentId: string | null, name = id): GroupRow {
  return { id, name, parentId, description: null, createdAt: T0, updatedAt: T0 };
}

/**
 * 서비스가 실제로 부르는 질의 모양만 흉내 낸 좁은 대역이다.
 * 실제 DB 를 띄우는 통합 시험은 이 저장소에 없으므로(auth.service.test.ts 와 같은 방식),
 * 여기서는 "거부해야 할 때 거부하는가"만 본다.
 */
function buildService(
  seed: {
    groups?: GroupRow[];
    members?: MemberRow[];
    users?: UserRow[];
    pms?: Array<{ projectId: string; userId: string }>;
  } = {},
) {
  const groups = [...(seed.groups ?? [])];
  const members = [...(seed.members ?? [])];
  // seed.users 를 주지 않으면 기존 동작(요청받은 id 를 무조건 활성 사용자로 합성)을
  // 그대로 유지해, users 를 몰라도 되는 기존 시험들을 깨지 않는다.
  const users = seed.users;
  const pms = seed.pms ?? [];

  const prismaObject = {
    userGroup: {
      findMany: vi.fn(async () => groups),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          groups.find((g) => g.id === where.id) ?? null,
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { parentId: string | null; name: string; id?: { not: string } };
        }) =>
          groups.find(
            (g) =>
              g.parentId === where.parentId &&
              g.name === where.name &&
              (where.id === undefined || g.id !== where.id.not),
          ) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { parentId: string } }) =>
          groups.filter((g) => g.parentId === where.parentId).length,
      ),
      create: vi.fn(async ({ data }: { data: GroupRow }) => {
        const row = { ...data, createdAt: T0, updatedAt: T0 };
        groups.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<GroupRow> }) => {
        const row = groups.find((g) => g.id === where.id)!;
        Object.assign(row, data, { updatedAt: T0 });
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = groups.findIndex((g) => g.id === where.id);
        return groups.splice(i, 1)[0]!;
      }),
    },
    userGroupMember: {
      findMany: vi.fn(
        async (args?: {
          where?: { userId?: { in: string[] }; groupId?: string };
          include?: { user?: unknown };
          orderBy?: { addedAt?: 'asc' | 'desc' };
        }) => {
          const where = args?.where;
          let filtered = !where
            ? members
            : members.filter(
                (m) =>
                  (where.groupId === undefined || m.groupId === where.groupId) &&
                  (where.userId === undefined || where.userId.in.includes(m.userId)),
              );
          // listMembers() 는 orderBy: { addedAt: 'asc' } 로 가입 시각순 정렬을 요구한다.
          // 대역이 orderBy 를 무시하면 정렬 절이 사라지거나 거꾸로 되어도 시험이
          // 조용히 통과하므로, 여기서 실제로 정렬해야 한다.
          if (args?.orderBy?.addedAt) {
            const dir = args.orderBy.addedAt === 'desc' ? -1 : 1;
            filtered = [...filtered].sort(
              (a, b) => dir * (a.addedAt.getTime() - b.addedAt.getTime()),
            );
          }
          // listMembers() 는 include: { user } 로 유저 정보를 함께 요청한다.
          // 대역에도 같은 모양으로 합성해 붙여야 서비스 코드가 그대로 동작한다.
          if (args?.include?.user) {
            return filtered.map((m) => ({
              ...m,
              user: {
                id: m.userId,
                username: m.userId,
                displayName: `이름-${m.userId}`,
                isActive: true,
              },
            }));
          }
          return filtered;
        },
      ),
      count: vi.fn(async ({ where }: { where: { groupId: string } }) =>
        members.filter((m) => m.groupId === where.groupId).length,
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { groupId_userId: { groupId: string; userId: string } };
        }) =>
          members.find(
            (m) =>
              m.groupId === where.groupId_userId.groupId &&
              m.userId === where.groupId_userId.userId,
          ) ?? null,
      ),
      createMany: vi.fn(async ({ data }: { data: MemberRow[] }) => {
        for (const row of data) members.push({ ...row, addedAt: T0 });
        return { count: data.length };
      }),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { OR: Array<{ groupId: string; userId: string }> };
        }) => {
          let count = 0;
          for (const key of where.OR) {
            const i = members.findIndex(
              (m) => m.groupId === key.groupId && m.userId === key.userId,
            );
            if (i >= 0) {
              members.splice(i, 1);
              count += 1;
            }
          }
          return { count };
        },
      ),
      delete: vi.fn(
        async ({
          where,
        }: {
          where: { groupId_userId: { groupId: string; userId: string } };
        }) => {
          const i = members.findIndex(
            (m) =>
              m.groupId === where.groupId_userId.groupId &&
              m.userId === where.groupId_userId.userId,
          );
          return members.splice(i, 1)[0]!;
        },
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
          // 기존 동작을 유지한다(USER_NOT_FOUND 분기를 보지 않는 기존 시험들이 이걸 쓴다).
          if (users === undefined) {
            return where.id.in.map((id) => ({
              id,
              username: id,
              displayName: `이름-${id}`,
              isActive: true,
            }));
          }
          // seed.users 를 주면 실제로 isActive 를 반영하고, 씨앗에 없는 id 는 돌려주지
          // 않는다 — 그래야 USER_NOT_FOUND(비활성·미존재) 분기를 시험으로 검증할 수 있다.
          return where.id.in
            .map((id) => users.find((u) => u.id === id))
            .filter(
              (u): u is UserRow =>
                u !== undefined && (where.isActive === undefined || u.isActive === where.isActive),
            )
            .map((u) => ({
              id: u.id,
              username: u.id,
              displayName: `이름-${u.id}`,
              isActive: u.isActive,
            }));
        },
      ),
    },
    projectMember: {
      findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
        pms
          .filter((m) => where.userId.in.includes(m.userId))
          .map((m) => ({
            ...m,
            project: { id: m.projectId, name: m.projectId, status: 'ACTIVE' },
          })),
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };
  const prisma = prismaObject as unknown as PrismaService;

  const audit = { log: vi.fn(async () => {}) } as unknown as AuditService;
  // prismaObject 를 그대로 함께 돌려준다. PrismaService 로 단언한 prisma 는 vi.fn 의
  // 호출 기록에 접근할 수 없기 때문이다.
  return { service: new GroupsService(prisma, audit), audit, groups, members, prismaSpies: prismaObject };
}

const CTX = { actorId: 'admin-1' };

describe('GroupsService.create', () => {
  it('최상위 그룹의 이름 중복을 애플리케이션이 막는다', async () => {
    // DB 의 @@unique([parentId, name]) 은 NULL 끼리 걸리지 않으므로 이 검사가 유일한 방어선이다.
    const { service } = buildService({ groups: [group('a', null, '구매팀')] });
    await expect(
      service.create({ name: '구매팀', parentId: null, description: null }, CTX),
    ).rejects.toMatchObject({ response: { error: 'GROUP_NAME_DUPLICATE' } });
  });

  it('같은 상위 아래의 이름 중복도 막는다', async () => {
    const { service } = buildService({
      groups: [group('root', null), group('a', 'root', '기구완성팀')],
    });
    await expect(
      service.create({ name: '기구완성팀', parentId: 'root', description: null }, CTX),
    ).rejects.toMatchObject({ response: { error: 'GROUP_NAME_DUPLICATE' } });
  });

  it('상위가 다르면 같은 이름을 허용한다', async () => {
    const { service } = buildService({
      groups: [group('r1', null), group('r2', null), group('a', 'r1', '개발팀')],
    });
    const created = await service.create(
      { name: '개발팀', parentId: 'r2', description: null },
      CTX,
    );
    expect(created.name).toBe('개발팀');
  });

  it('없는 상위 그룹을 지정하면 거부한다', async () => {
    const { service } = buildService();
    await expect(
      service.create({ name: 'x', parentId: 'nope', description: null }, CTX),
    ).rejects.toMatchObject({ response: { error: 'GROUP_NOT_FOUND' } });
  });

  it('8단계 아래에 또 만들면 거부한다', async () => {
    const chain = Array.from({ length: 8 }, (_, i) => group(`g${i}`, i === 0 ? null : `g${i - 1}`));
    const { service } = buildService({ groups: chain });
    await expect(
      service.create({ name: 'x', parentId: 'g7', description: null }, CTX),
    ).rejects.toMatchObject({ response: { error: 'GROUP_DEPTH_EXCEEDED' } });
  });

  it('생성에 성공하면 GROUP_CREATE 를 남긴다', async () => {
    const { service, audit } = buildService();
    await service.create({ name: '구매팀', parentId: null, description: null }, CTX);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'GROUP_CREATE' }));
  });
});

describe('GroupsService.update', () => {
  // 모든 seed 그룹의 updatedAt 이 T0 이므로, 정상 흐름은 이 값을 그대로 보낸다.
  const EXPECTED = T0.toISOString();
  const SAMPLE = [
    group('center', null, '운영기술센터'),
    group('mech', 'center', '기구완성팀'),
    group('purchase', null, '구매팀'),
  ];

  it('자기 자신을 상위로 지정하면 GROUP_CYCLE', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('center', { parentId: 'center', expectedUpdatedAt: EXPECTED }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_CYCLE' },
    });
  });

  it('자기 자손을 상위로 지정하면 GROUP_CYCLE', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('center', { parentId: 'mech', expectedUpdatedAt: EXPECTED }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_CYCLE' },
    });
  });

  it('깊이 상한을 넘기면 GROUP_DEPTH_EXCEEDED', async () => {
    const chain = Array.from({ length: 8 }, (_, i) => group(`g${i}`, i === 0 ? null : `g${i - 1}`));
    chain.push(group('loose', null));
    const { service } = buildService({ groups: chain });
    await expect(service.update('loose', { parentId: 'g7', expectedUpdatedAt: EXPECTED }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_DEPTH_EXCEEDED' },
    });
  });

  it('옮긴 자리에 같은 이름이 있으면 GROUP_NAME_DUPLICATE', async () => {
    const { service } = buildService({
      groups: [...SAMPLE, group('dup', 'center', '구매팀')],
    });
    await expect(service.update('purchase', { parentId: 'center', expectedUpdatedAt: EXPECTED }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NAME_DUPLICATE' },
    });
  });

  it('없는 그룹은 GROUP_NOT_FOUND', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('nope', { name: 'x', expectedUpdatedAt: EXPECTED }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NOT_FOUND' },
    });
  });

  it('이름만 바꾸는 것은 통과한다', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    const updated = await service.update('mech', { name: '기구설계팀', expectedUpdatedAt: EXPECTED }, CTX);
    expect(updated.name).toBe('기구설계팀');
  });

  it('소속 인원이 있는 그룹을 수정해도 실제 인원수를 그대로 돌려준다', async () => {
    // 과거 결함: update() 가 항상 0, 0 을 돌려주어 tree() 가 보여주는 숫자와 어긋났다.
    const { service } = buildService({
      groups: [...SAMPLE],
      members: [
        { groupId: 'center', userId: 'head', addedById: 'admin-1', addedAt: T0 },
        // 자손(mech) 소속도 center 의 누계에 잡혀야 한다.
        { groupId: 'mech', userId: 'm1', addedById: 'admin-1', addedAt: T0 },
      ],
    });
    const updated = await service.update('center', { name: '운영기술본부', expectedUpdatedAt: EXPECTED }, CTX);
    expect(updated.directMemberCount).toBe(1);
    expect(updated.totalMemberCount).toBe(2);
  });

  it('expectedUpdatedAt 이 현재 값과 다르면 409 CONFLICT', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(
      service.update(
        'mech',
        { name: '기구설계팀', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' },
        CTX,
      ),
    ).rejects.toMatchObject({
      response: { code: 'CONFLICT', currentUpdatedAt: EXPECTED },
    });
  });

  it('충돌로 거부하면 아무것도 쓰지 않는다', async () => {
    const { service, prismaSpies } = buildService({ groups: [...SAMPLE] });
    await expect(
      service.update('mech', { name: 'x', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' }, CTX),
    ).rejects.toBeTruthy();
    expect(prismaSpies.userGroup.update).not.toHaveBeenCalled();
  });
});

describe('GroupsService.remove', () => {
  it('소속 인원이 있으면 GROUP_NOT_EMPTY', async () => {
    const { service } = buildService({
      groups: [group('a', null)],
      members: [{ groupId: 'a', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await expect(service.remove('a', CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NOT_EMPTY', memberCount: 1, childCount: 0 },
    });
  });

  it('하위 그룹이 있으면 GROUP_NOT_EMPTY', async () => {
    const { service } = buildService({
      groups: [group('a', null), group('b', 'a')],
    });
    await expect(service.remove('a', CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NOT_EMPTY', memberCount: 0, childCount: 1 },
    });
  });

  it('둘 다 없으면 지우고 GROUP_DELETE 를 남긴다', async () => {
    const { service, audit, groups } = buildService({ groups: [group('a', null)] });
    await service.remove('a', CTX);
    expect(groups).toHaveLength(0);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'GROUP_DELETE' }));
  });
});

describe('GroupsService.tree', () => {
  it('누계 인원수는 자손을 포함하고 같은 사람을 두 번 세지 않는다', async () => {
    const { service } = buildService({
      groups: [group('center', null), group('mech', 'center')],
      members: [
        { groupId: 'center', userId: 'head', addedById: 'a', addedAt: T0 },
        { groupId: 'mech', userId: 'm1', addedById: 'a', addedAt: T0 },
        // 겸직 데이터가 들어와도 누계가 부풀지 않아야 한다.
        { groupId: 'mech', userId: 'head', addedById: 'a', addedAt: T0 },
      ],
    });
    const { groups } = await service.tree();
    const center = groups.find((g) => g.id === 'center')!;
    expect(center.directMemberCount).toBe(1);
    expect(center.totalMemberCount).toBe(2);
  });
});

describe('GroupsService.addMembers', () => {
  it('move 없이 다른 그룹 소속자를 넣으면 거부하고 충돌 목록을 담는다', async () => {
    const { service } = buildService({
      groups: [group('a', null), group('b', null)],
      members: [{ groupId: 'b', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await expect(
      service.addMembers('a', { userIds: ['u1'], move: false }, CTX),
    ).rejects.toMatchObject({
      response: {
        error: 'GROUP_MEMBER_ALREADY_ASSIGNED',
        conflicts: [{ groupId: 'b', userId: 'u1' }],
      },
    });
  });

  it('move: true 면 기존 소속에서 빼고 옮긴다', async () => {
    const { service, members } = buildService({
      groups: [group('a', null), group('b', null)],
      members: [{ groupId: 'b', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await service.addMembers('a', { userIds: ['u1'], move: true }, CTX);
    expect(members).toEqual([expect.objectContaining({ groupId: 'a', userId: 'u1' })]);
  });

  it('옮긴 경우 REMOVE 와 ADD 를 모두 남기고 상대 그룹을 상세에 적는다', async () => {
    const { service, audit } = buildService({
      groups: [group('a', null), group('b', null)],
      members: [{ groupId: 'b', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await service.addMembers('a', { userIds: ['u1'], move: true }, CTX);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GROUP_MEMBER_REMOVE',
        payload: expect.objectContaining({ movedTo: 'a' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GROUP_MEMBER_ADD',
        payload: expect.objectContaining({ movedFrom: 'b' }),
      }),
    );
  });

  it('이미 이 그룹 소속인 사람은 조용히 건너뛴다', async () => {
    const { service, members } = buildService({
      groups: [group('a', null)],
      members: [{ groupId: 'a', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await service.addMembers('a', { userIds: ['u1', 'u2'], move: false }, CTX);
    expect(members).toHaveLength(2);
  });

  it('없는 그룹이면 GROUP_NOT_FOUND', async () => {
    const { service } = buildService();
    await expect(
      service.addMembers('nope', { userIds: ['u1'], move: false }, CTX),
    ).rejects.toMatchObject({ response: { error: 'GROUP_NOT_FOUND' } });
  });

  it('비활성 사용자가 섞이면 USER_INACTIVE (USER_NOT_FOUND 로 오해하게 하지 않는다)', async () => {
    const { service } = buildService({
      groups: [group('a', null)],
      users: [
        { id: 'u1', isActive: true },
        { id: 'u2', isActive: false },
      ],
    });
    await expect(
      service.addMembers('a', { userIds: ['u1', 'u2'], move: false }, CTX),
    ).rejects.toMatchObject({
      response: { error: 'USER_INACTIVE', inactive: ['u2'] },
    });
  });

  it('존재하지 않는 사용자만 있으면 USER_NOT_FOUND', async () => {
    const { service } = buildService({
      groups: [group('a', null)],
      users: [{ id: 'u1', isActive: true }],
    });
    await expect(
      service.addMembers('a', { userIds: ['ghost'], move: false }, CTX),
    ).rejects.toMatchObject({
      response: { error: 'USER_NOT_FOUND', missing: ['ghost'] },
    });
  });

  it('존재하지 않는 사용자 id 가 섞이면 USER_NOT_FOUND', async () => {
    const { service } = buildService({
      groups: [group('a', null)],
      users: [{ id: 'u1', isActive: true }],
    });
    await expect(
      service.addMembers('a', { userIds: ['u1', 'ghost'], move: false }, CTX),
    ).rejects.toMatchObject({
      response: { error: 'USER_NOT_FOUND', missing: ['ghost'] },
    });
  });
});

describe('GroupsService.listMembers', () => {
  it('가입 시각이 이른 사람부터 돌려준다', async () => {
    const early = new Date('2026-09-01T00:00:00.000Z');
    const late = new Date('2026-09-02T00:00:00.000Z');
    const { service } = buildService({
      groups: [group('a', null)],
      // 일부러 늦게 가입한 사람을 먼저 넣어 둔다. 대역이 orderBy 를 무시하면
      // 결과가 삽입 순서(late, early) 그대로 나와 시험이 실패한다.
      members: [
        { groupId: 'a', userId: 'u-late', addedById: 'admin-1', addedAt: late },
        { groupId: 'a', userId: 'u-early', addedById: 'admin-1', addedAt: early },
      ],
    });
    const result = await service.listMembers('a');
    expect(result.map((m) => m.userId)).toEqual(['u-early', 'u-late']);
  });
});

describe('GroupsService.removeMember', () => {
  it('소속이 아니면 404', async () => {
    const { service } = buildService({ groups: [group('a', null)] });
    await expect(service.removeMember('a', 'u1', CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_MEMBER_NOT_FOUND' },
    });
  });

  it('빼고 GROUP_MEMBER_REMOVE 를 남긴다', async () => {
    const { service, audit, members } = buildService({
      groups: [group('a', null)],
      members: [{ groupId: 'a', userId: 'u1', addedById: 'admin-1', addedAt: T0 }],
    });
    await service.removeMember('a', 'u1', CTX);
    expect(members).toHaveLength(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GROUP_MEMBER_REMOVE' }),
    );
  });
});

describe('GroupsService.projectCoverage', () => {
  const GROUPS = [group('center', null), group('mech', 'center')];
  const MEMBERS = [
    { groupId: 'center', userId: 'head', addedById: 'a', addedAt: T0 },
    { groupId: 'mech', userId: 'm1', addedById: 'a', addedAt: T0 },
    { groupId: 'mech', userId: 'm2', addedById: 'a', addedAt: T0 },
  ];

  it('자손 인원까지 포함해 집계하고 빠진 사람을 알려 준다', async () => {
    const { service } = buildService({
      groups: GROUPS,
      members: MEMBERS,
      pms: [
        { projectId: 'p1', userId: 'head' },
        { projectId: 'p1', userId: 'm1' },
      ],
    });
    const rows = await service.projectCoverage('center');
    expect(rows).toEqual([
      expect.objectContaining({
        projectId: 'p1',
        groupMemberCount: 3,
        participatingCount: 2,
        missingUserIds: ['m2'],
      }),
    ]);
  });

  it('참여 비율이 높은 순으로 늘어놓는다', async () => {
    const { service } = buildService({
      groups: GROUPS,
      members: MEMBERS,
      pms: [
        { projectId: 'low', userId: 'head' },
        { projectId: 'high', userId: 'head' },
        { projectId: 'high', userId: 'm1' },
        { projectId: 'high', userId: 'm2' },
      ],
    });
    const rows = await service.projectCoverage('center');
    expect(rows.map((r) => r.projectId)).toEqual(['high', 'low']);
  });

  it('그룹에 인원이 없으면 빈 배열', async () => {
    const { service } = buildService({ groups: GROUPS });
    expect(await service.projectCoverage('center')).toEqual([]);
  });

  it('없는 그룹이면 GROUP_NOT_FOUND', async () => {
    const { service } = buildService();
    await expect(service.projectCoverage('nope')).rejects.toMatchObject({
      response: { error: 'GROUP_NOT_FOUND' },
    });
  });
});
