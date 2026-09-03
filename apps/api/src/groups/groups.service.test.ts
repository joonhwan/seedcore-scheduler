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

const T0 = new Date('2026-09-01T00:00:00.000Z');

function group(id: string, parentId: string | null, name = id): GroupRow {
  return { id, name, parentId, description: null, createdAt: T0, updatedAt: T0 };
}

/**
 * 서비스가 실제로 부르는 질의 모양만 흉내 낸 좁은 대역이다.
 * 실제 DB 를 띄우는 통합 시험은 이 저장소에 없으므로(auth.service.test.ts 와 같은 방식),
 * 여기서는 "거부해야 할 때 거부하는가"만 본다.
 */
function buildService(seed: { groups?: GroupRow[]; members?: MemberRow[] } = {}) {
  const groups = [...(seed.groups ?? [])];
  const members = [...(seed.members ?? [])];

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
        }) => {
          const where = args?.where;
          const filtered = !where
            ? members
            : members.filter(
                (m) =>
                  (where.groupId === undefined || m.groupId === where.groupId) &&
                  (where.userId === undefined || where.userId.in.includes(m.userId)),
              );
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
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          username: id,
          displayName: `이름-${id}`,
          isActive: true,
        })),
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };
  const prisma = prismaObject as unknown as PrismaService;

  const audit = { log: vi.fn(async () => {}) } as unknown as AuditService;
  return { service: new GroupsService(prisma, audit), audit, groups, members };
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
  const SAMPLE = [
    group('center', null, '운영기술센터'),
    group('mech', 'center', '기구완성팀'),
    group('purchase', null, '구매팀'),
  ];

  it('자기 자신을 상위로 지정하면 GROUP_CYCLE', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('center', { parentId: 'center' }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_CYCLE' },
    });
  });

  it('자기 자손을 상위로 지정하면 GROUP_CYCLE', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('center', { parentId: 'mech' }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_CYCLE' },
    });
  });

  it('깊이 상한을 넘기면 GROUP_DEPTH_EXCEEDED', async () => {
    const chain = Array.from({ length: 8 }, (_, i) => group(`g${i}`, i === 0 ? null : `g${i - 1}`));
    chain.push(group('loose', null));
    const { service } = buildService({ groups: chain });
    await expect(service.update('loose', { parentId: 'g7' }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_DEPTH_EXCEEDED' },
    });
  });

  it('옮긴 자리에 같은 이름이 있으면 GROUP_NAME_DUPLICATE', async () => {
    const { service } = buildService({
      groups: [...SAMPLE, group('dup', 'center', '구매팀')],
    });
    await expect(service.update('purchase', { parentId: 'center' }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NAME_DUPLICATE' },
    });
  });

  it('없는 그룹은 GROUP_NOT_FOUND', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    await expect(service.update('nope', { name: 'x' }, CTX)).rejects.toMatchObject({
      response: { error: 'GROUP_NOT_FOUND' },
    });
  });

  it('이름만 바꾸는 것은 통과한다', async () => {
    const { service } = buildService({ groups: [...SAMPLE] });
    const updated = await service.update('mech', { name: '기구설계팀' }, CTX);
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
    const updated = await service.update('center', { name: '운영기술본부' }, CTX);
    expect(updated.directMemberCount).toBe(1);
    expect(updated.totalMemberCount).toBe(2);
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
