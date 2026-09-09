import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { AuditService } from '../audit/audit.service';

const T0 = new Date('2026-09-01T00:00:00.000Z');

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordMustChange: boolean;
  globalRole: string;
  isActive: boolean;
  preferencesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  retiredAt: Date | null;
}

function userRow(over: Partial<UserRow> & { id: string }): UserRow {
  return {
    username: over.id,
    displayName: over.id,
    passwordHash: 'x',
    passwordMustChange: false,
    globalRole: 'USER',
    isActive: true,
    preferencesJson: null,
    createdAt: T0,
    updatedAt: T0,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    retiredAt: null,
    ...over,
  };
}

/**
 * 열 갈래의 건수를 통째로 받아 대역을 만든다. 키를 빠뜨리면 0 으로 본다.
 */
interface Counts {
  projectMemberships?: number;
  groupMemberships?: number;
  createdProjects?: number;
  nodesCreated?: number;
  nodesUpdated?: number;
  comments?: number;
  history?: number;
  membershipsAdded?: number;
  groupMembersAdded?: number;
  serverNoticesCreated?: number;
}

interface GroupRow {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function buildService(
  seed: { users?: UserRow[]; counts?: Counts; groups?: GroupRow[] } = {},
) {
  const users = [...(seed.users ?? [userRow({ id: 'u1' })])];
  const groupRows: GroupRow[] = [...(seed.groups ?? [])];
  const groupMemberRows: { groupId: string; userId: string; addedById: string }[] = [];
  const c = seed.counts ?? {};
  const auditRows: { actorId: string | null }[] = [];
  const deleted: string[] = [];

  const prismaObject = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      ),
      findMany: vi.fn(
        async ({
          where,
        }: {
          where?: { retiredAt?: null; isActive?: boolean; username?: { in: string[] } };
        }) => {
          if (where?.username !== undefined) {
            const wanted = new Set(where.username.in);
            return users.filter((u) => wanted.has(u.username));
          }
          return users.filter(
            (u) =>
              (where?.retiredAt === undefined || u.retiredAt === null) &&
              (where?.isActive === undefined || u.isActive === where.isActive),
          );
        },
      ),
      count: vi.fn(
        async ({ where }: { where: { globalRole?: string; isActive?: boolean; id?: { not: string } } }) =>
          users.filter(
            (u) =>
              (where.globalRole === undefined || u.globalRole === where.globalRole) &&
              (where.isActive === undefined || u.isActive === where.isActive) &&
              (where.id === undefined || u.id !== where.id.not),
          ).length,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
          const i = users.findIndex((u) => u.id === where.id);
          // 실제 Prisma 는 findUnique 가 돌려준 객체를 건드리지 않고 새 행을 돌려준다.
          // 대역이 제자리에서 바꾸면 서비스 안에서 target 과 updated 가 같은 객체가 되어,
          // 운영에서는 멀쩡한 코드가 시험에서만 실패한다.
          const next = { ...users[i]!, ...data };
          users[i] = next;
          return next;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = users.findIndex((u) => u.id === where.id);
        // 실제 Prisma 는 대상이 없으면 P2025 를 던진다. -1 을 그대로 splice 에 넘기면
        // 마지막 사람을 대신 지우고 그것을 돌려주는 채로 조용히 통과해, 없는 대상을
        // 지우려 한 회귀를 잡아 주지 못한다.
        if (i === -1) throw new Error('P2025: Record to delete does not exist.');
        deleted.push(where.id);
        return users.splice(i, 1)[0]!;
      }),
      create: vi.fn(
        async ({ data }: { data: Partial<UserRow> & { id: string; username: string } }) => {
          // 실제 SQLite 는 username 유일 제약을 P2002 로 알린다. 대역이 조용히 두 번째 행을
          // 받아 주면 경합 시험이 통과해 버린다.
          if (users.some((u) => u.username === data.username)) {
            const err = new Error('Unique constraint failed') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          const row = userRow({ ...data, id: data.id });
          users.push(row);
          return row;
        },
      ),
    },
    projectMember: {
      count: vi.fn(async ({ where }: { where: { userId?: string; addedById?: string } }) =>
        where.addedById !== undefined ? (c.membershipsAdded ?? 0) : (c.projectMemberships ?? 0),
      ),
    },
    userGroupMember: {
      count: vi.fn(async ({ where }: { where: { userId?: string; addedById?: string } }) =>
        where.addedById !== undefined ? (c.groupMembersAdded ?? 0) : (c.groupMemberships ?? 0),
      ),
      create: vi.fn(
        async ({ data }: { data: { groupId: string; userId: string; addedById: string } }) => {
          groupMemberRows.push(data);
          return data;
        },
      ),
    },
    userGroup: {
      findMany: vi.fn(async () => groupRows),
      create: vi.fn(
        async ({ data }: { data: { id: string; name: string; parentId: string | null } }) => {
          const row: GroupRow = { ...data, description: null, createdAt: T0, updatedAt: T0 };
          groupRows.push(row);
          return row;
        },
      ),
    },
    project: { count: vi.fn(async () => c.createdProjects ?? 0) },
    scheduleNode: {
      count: vi.fn(async ({ where }: { where: { createdById?: string; updatedById?: string } }) =>
        where.updatedById !== undefined ? (c.nodesUpdated ?? 0) : (c.nodesCreated ?? 0),
      ),
    },
    nodeComment: { count: vi.fn(async () => c.comments ?? 0) },
    nodeHistory: { count: vi.fn(async () => c.history ?? 0) },
    serverNotice: { count: vi.fn(async () => c.serverNoticesCreated ?? 0) },
    auditLog: {
      updateMany: vi.fn(async () => {
        auditRows.push({ actorId: null });
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };

  const prisma = prismaObject as unknown as PrismaService;
  const auth = {
    hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
  } as unknown as AuthService;
  const sessions = { destroyAllForUser: vi.fn(async () => 2) } as unknown as SessionsService;
  const audit = { log: vi.fn(async () => undefined) } as unknown as AuditService;

  return {
    service: new UsersService(prisma, auth, sessions, audit),
    prismaObject,
    sessions,
    audit,
    users,
    deleted,
    auditRows,
    groupRows,
    groupMemberRows,
  };
}

describe('UsersService.list()', () => {
  const seed = {
    users: [
      userRow({ id: 'active1' }),
      userRow({ id: 'inactive1', isActive: false }),
      userRow({ id: 'retired1', isActive: false, retiredAt: T0 }),
    ],
  };

  it('기본으로는 퇴사자를 빼고 보여준다', async () => {
    const { service } = buildService(seed);
    const rows = await service.list({ status: 'all' });
    expect(rows.map((r) => r.id)).toEqual(['active1', 'inactive1']);
  });

  it('includeRetired 를 켜면 퇴사자도 보여준다', async () => {
    const { service } = buildService(seed);
    const rows = await service.list({ status: 'all', includeRetired: true });
    expect(rows.map((r) => r.id)).toEqual(['active1', 'inactive1', 'retired1']);
  });

  it('퇴사 시각을 응답에 담는다', async () => {
    const { service } = buildService(seed);
    const rows = await service.list({ status: 'all', includeRetired: true });
    expect(rows.find((r) => r.id === 'retired1')!.retiredAt).toBe(T0.toISOString());
    expect(rows.find((r) => r.id === 'active1')!.retiredAt).toBeNull();
  });
});

describe('UsersService.activity()', () => {
  it('열 갈래가 모두 0 이면 삭제할 수 있다', async () => {
    const { service } = buildService();
    const result = await service.activity('u1');
    expect(result.canDelete).toBe(true);
    expect(result.clearable).toEqual({ projectMemberships: 0, groupMemberships: 0 });
  });

  it('정리하면 없어지는 것만 있어도 삭제할 수 없다', async () => {
    const { service } = buildService({ counts: { projectMemberships: 3, groupMemberships: 1 } });
    const result = await service.activity('u1');
    expect(result.canDelete).toBe(false);
    expect(result.clearable).toEqual({ projectMemberships: 3, groupMemberships: 1 });
    expect(result.permanent.nodesUpdated).toBe(0);
  });

  it('남을 추가한 기록도 센다', async () => {
    const { service } = buildService({ counts: { membershipsAdded: 4, groupMembersAdded: 2 } });
    const result = await service.activity('u1');
    expect(result.canDelete).toBe(false);
    expect(result.permanent.membershipsAdded).toBe(4);
    expect(result.permanent.groupMembersAdded).toBe(2);
  });

  it('일정 생성과 수정을 따로 센다', async () => {
    const { service } = buildService({ counts: { nodesCreated: 7, nodesUpdated: 47 } });
    const result = await service.activity('u1');
    expect(result.permanent.nodesCreated).toBe(7);
    expect(result.permanent.nodesUpdated).toBe(47);
  });

  // FK 가 ON DELETE RESTRICT 라(20260907001706_server_notices), 재시작 예고만 등록하고
  // 다른 활동이 없는 계정도 이 집계에 잡히지 않으면 canDelete: true 가 나온 뒤 실제
  // 삭제 트랜잭션이 FK 제약으로 500 을 던진다. 그 회귀를 여기서 잡는다.
  it('재시작 예고만 등록한 계정은 삭제할 수 없다', async () => {
    const { service } = buildService({ counts: { serverNoticesCreated: 1 } });
    const result = await service.activity('u1');
    expect(result.canDelete).toBe(false);
    expect(result.permanent.serverNoticesCreated).toBe(1);
  });

  it('없는 사용자는 USER_NOT_FOUND 다', async () => {
    const { service } = buildService();
    await expect(service.activity('missing')).rejects.toMatchObject({
      response: { error: 'USER_NOT_FOUND' },
    });
  });
});

const CTX = { actorId: 'admin1', ip: '127.0.0.1', userAgent: 'test' };

describe('UsersService.update()', () => {
  it('퇴사자를 { isActive: true } 로 되돌리려 하면 ALREADY_RETIRED 로 거부하고 행을 바꾸지 않는다', async () => {
    const { service, users } = buildService({
      users: [userRow({ id: 'u1', isActive: false, retiredAt: T0 })],
    });

    await expect(
      service.update('u1', { isActive: true }, CTX),
    ).rejects.toMatchObject({ response: { error: 'ALREADY_RETIRED' } });

    const row = users.find((u) => u.id === 'u1')!;
    expect(row.isActive).toBe(false);
    expect(row.retiredAt).not.toBeNull();
  });

  it('재직 중인 사용자에게 { isActive: true } 는 예전처럼 통과한다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'u1', isActive: false })],
    });

    const result = await service.update('u1', { isActive: true }, CTX);

    expect(result.isActive).toBe(true);
  });

  it('퇴사자에게 { displayName } 만 보내는 것은 통과한다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'u1', isActive: false, retiredAt: T0 })],
    });

    const result = await service.update('u1', { displayName: '새이름' }, CTX);

    expect(result.displayName).toBe('새이름');
  });
});

describe('UsersService.retire()', () => {
  it('retired_at 과 is_active 를 함께 바꾸고 세션을 끊는다', async () => {
    const { service, sessions, audit, users } = buildService({
      users: [userRow({ id: 'u1' }), userRow({ id: 'admin1', globalRole: 'ADMIN' })],
    });

    const result = await service.retire('u1', CTX);

    expect(result.retiredAt).not.toBeNull();
    expect(result.isActive).toBe(false);
    expect(users.find((u) => u.id === 'u1')!.retiredAt).not.toBeNull();
    expect(sessions.destroyAllForUser).toHaveBeenCalledWith('u1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_RETIRE',
        payload: { wasActive: true, sessionsKilled: 2 },
      }),
    );
  });

  it('퇴사 직전에 비활성이던 것을 wasActive 로 남긴다', async () => {
    const { service, audit } = buildService({
      users: [userRow({ id: 'u1', isActive: false }), userRow({ id: 'admin1', globalRole: 'ADMIN' })],
    });

    await service.retire('u1', CTX);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { wasActive: false, sessionsKilled: 2 } }),
    );
  });

  it('자기 자신은 퇴사시킬 수 없다', async () => {
    const { service } = buildService({ users: [userRow({ id: 'admin1', globalRole: 'ADMIN' })] });
    await expect(service.retire('admin1', CTX)).rejects.toMatchObject({
      response: { error: 'SELF_ACTION_FORBIDDEN' },
    });
  });

  it('이미 퇴사한 사람은 다시 퇴사시킬 수 없다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'u1', isActive: false, retiredAt: T0 })],
    });
    await expect(service.retire('u1', CTX)).rejects.toMatchObject({
      response: { error: 'ALREADY_RETIRED' },
    });
  });

  it('활성 ADMIN 이 자기 혼자면 그 계정을 퇴사시킬 수 없다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'onlyAdmin', globalRole: 'ADMIN' }), userRow({ id: 'admin1' })],
    });
    await expect(service.retire('onlyAdmin', CTX)).rejects.toMatchObject({
      response: { error: 'LAST_ACTIVE_ADMIN' },
    });
  });
});

describe('UsersService.unretire()', () => {
  it('retired_at 을 비우고 활성으로 되돌린다', async () => {
    const { service, audit, users } = buildService({
      users: [userRow({ id: 'u1', isActive: false, retiredAt: T0 })],
    });

    const result = await service.unretire('u1', CTX);

    expect(result.retiredAt).toBeNull();
    expect(result.isActive).toBe(true);
    expect(users.find((u) => u.id === 'u1')!.retiredAt).toBeNull();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_UNRETIRE' }),
    );
  });

  it('재직 중인 사람은 복직시킬 수 없다', async () => {
    const { service } = buildService({ users: [userRow({ id: 'u1' })] });
    await expect(service.unretire('u1', CTX)).rejects.toMatchObject({
      response: { error: 'NOT_RETIRED' },
    });
  });
});

describe('UsersService.remove()', () => {
  it('활동이 없으면 감사로그의 행위자를 비운 뒤 지운다', async () => {
    const { service, prismaObject, audit, deleted } = buildService({
      users: [userRow({ id: 'u1', username: 'hong', displayName: '홍길동' })],
    });

    await service.remove('u1', CTX);

    expect(prismaObject.auditLog.updateMany).toHaveBeenCalledWith({
      where: { actorId: 'u1' },
      data: { actorId: null },
    });
    expect(deleted).toEqual(['u1']);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_DELETE',
        payload: { username: 'hong', displayName: '홍길동' },
      }),
    );
  });

  it('활동이 한 건이라도 있으면 거부한다', async () => {
    const { service, deleted } = buildService({ counts: { comments: 1 } });
    await expect(service.remove('u1', CTX)).rejects.toMatchObject({
      response: { error: 'USER_HAS_ACTIVITY' },
    });
    expect(deleted).toEqual([]);
  });

  it('남을 추가한 기록만 있어도 거부한다', async () => {
    const { service, deleted } = buildService({ counts: { membershipsAdded: 1 } });
    await expect(service.remove('u1', CTX)).rejects.toMatchObject({
      response: { error: 'USER_HAS_ACTIVITY' },
    });
    expect(deleted).toEqual([]);
  });

  it('지우기 직전에 집계를 다시 센다', async () => {
    const { service, prismaObject } = buildService();
    await service.remove('u1', CTX);
    // 트랜잭션 안에서 열 번 센다 (projectMember 2, userGroupMember 2, scheduleNode 2, 나머지 4)
    expect(prismaObject.projectMember.count).toHaveBeenCalledTimes(2);
    expect(prismaObject.scheduleNode.count).toHaveBeenCalledTimes(2);
  });

  it('자기 자신은 지울 수 없다', async () => {
    const { service, deleted } = buildService({
      users: [userRow({ id: 'admin1', globalRole: 'ADMIN' })],
    });
    await expect(service.remove('admin1', CTX)).rejects.toMatchObject({
      response: { error: 'SELF_ACTION_FORBIDDEN' },
    });
    expect(deleted).toEqual([]);
  });

  it('퇴사한 사람도 활동이 없으면 지울 수 있다', async () => {
    const { service, deleted } = buildService({
      users: [userRow({ id: 'u1', isActive: false, retiredAt: T0 })],
    });
    await service.remove('u1', CTX);
    expect(deleted).toEqual(['u1']);
  });
});

const IMPORT_TEXT = [
  '운영기술센터',
  '  기구완성팀',
  '    - gigu01, 김민준-기구완성팀',
  '    - gigu02, 이서연-기구완성팀',
  '  - center01, 정하준-센터장',
].join('\n');
const IMPORT_CTX = { actorId: 'u1', ip: null, userAgent: null };

describe('UsersService.bulkImport() — 미리보기', () => {
  it('아무것도 쓰지 않고 만들 것만 세어 준다', async () => {
    const { service, users, groupRows } = buildService({ users: [userRow({ id: 'u1' })] });
    const r = await service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    expect(r.applied).toBe(false);
    expect(r.groupsToCreate).toEqual([['운영기술센터'], ['운영기술센터', '기구완성팀']]);
    expect(r.usersToCreate.map((u) => u.username)).toEqual(['gigu01', 'gigu02', 'center01']);
    expect(r.usersExisting).toEqual([]);
    expect(users).toHaveLength(1);
    expect(groupRows).toHaveLength(0);
  });

  it('이미 있는 아이디를 가려낸다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'u1' }), userRow({ id: 'x', username: 'gigu02' })],
    });
    const r = await service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    expect(r.usersExisting).toEqual([{ line: 4, username: 'gigu02' }]);
    expect(r.usersToCreate.map((u) => u.username)).toEqual(['gigu01', 'center01']);
  });

  it('퇴사자의 아이디도 이미 쓰이는 것으로 본다', async () => {
    const { service } = buildService({
      users: [
        userRow({ id: 'u1' }),
        userRow({ id: 'x', username: 'gigu01', retiredAt: T0, isActive: false }),
      ],
    });
    const r = await service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    expect(r.usersExisting.map((u) => u.username)).toEqual(['gigu01']);
  });

  it('이미 있는 그룹은 다시 만들지 않는다', async () => {
    const { service } = buildService({
      users: [userRow({ id: 'u1' })],
      groups: [
        {
          id: 'g1',
          name: '운영기술센터',
          parentId: null,
          description: null,
          createdAt: T0,
          updatedAt: T0,
        },
      ],
    });
    const r = await service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    expect(r.groupsExisting).toEqual([['운영기술센터']]);
    expect(r.groupsToCreate).toEqual([['운영기술센터', '기구완성팀']]);
  });

  it('파일 내용에 오류가 있으면 줄 번호와 함께 담아 돌려준다', async () => {
    const { service } = buildService();
    const r = await service.bulkImport(
      { text: '- 김하나, 이름', initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    expect(r.issues.map((i) => [i.line, i.code])).toEqual([[1, 'INVALID_USERNAME']]);
  });

  it('같은 입력이면 같은 previewToken 을 준다', async () => {
    const a = buildService({ users: [userRow({ id: 'u1' })] });
    const b = buildService({ users: [userRow({ id: 'u1' })] });
    const args = {
      text: IMPORT_TEXT,
      initialPassword: 'Init!2026',
      dryRun: true,
      skipExisting: false,
    };
    expect((await a.service.bulkImport(args, IMPORT_CTX)).previewToken).toBe(
      (await b.service.bulkImport(args, IMPORT_CTX)).previewToken,
    );
  });
});

describe('UsersService.bulkImport() — 적용', () => {
  async function preview(s: ReturnType<typeof buildService>, skipExisting = false) {
    return s.service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting },
      IMPORT_CTX,
    );
  }

  it('그룹과 사용자를 만들고 소속까지 넣는다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await preview(s);
    const r = await s.service.bulkImport(
      {
        text: IMPORT_TEXT,
        initialPassword: 'Init!2026',
        dryRun: false,
        skipExisting: false,
        previewToken: p.previewToken,
      },
      IMPORT_CTX,
    );
    expect(r.applied).toBe(true);
    expect(r.createdGroupCount).toBe(2);
    expect(r.createdUserCount).toBe(3);
    expect(r.skippedUserCount).toBe(0);
    expect(s.groupRows.map((g) => g.name)).toEqual(['운영기술센터', '기구완성팀']);
    expect(s.groupMemberRows).toHaveLength(3);
  });

  it('상위 그룹을 먼저 만들고 하위 그룹의 parentId 를 채운다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await preview(s);
    await s.service.bulkImport(
      {
        text: IMPORT_TEXT,
        initialPassword: 'Init!2026',
        dryRun: false,
        skipExisting: false,
        previewToken: p.previewToken,
      },
      IMPORT_CTX,
    );
    const center = s.groupRows.find((g) => g.name === '운영기술센터')!;
    const team = s.groupRows.find((g) => g.name === '기구완성팀')!;
    expect(center.parentId).toBeNull();
    expect(team.parentId).toBe(center.id);
  });

  it('만든 계정은 첫 로그인 시 비밀번호 변경을 강제한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await preview(s);
    await s.service.bulkImport(
      {
        text: IMPORT_TEXT,
        initialPassword: 'Init!2026',
        dryRun: false,
        skipExisting: false,
        previewToken: p.previewToken,
      },
      IMPORT_CTX,
    );
    const made = s.users.find((u) => u.username === 'gigu01')!;
    expect(made.passwordMustChange).toBe(true);
    expect(made.globalRole).toBe('USER');
    expect(made.isActive).toBe(true);
  });

  it('개별 기록과 일괄 등록 요약을 모두 감사로그에 남긴다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await preview(s);
    await s.service.bulkImport(
      {
        text: IMPORT_TEXT,
        initialPassword: 'Init!2026',
        dryRun: false,
        skipExisting: false,
        previewToken: p.previewToken,
      },
      IMPORT_CTX,
    );
    const log = s.audit.log as unknown as { mock: { calls: [{ action: string }][] } };
    const actions = log.mock.calls.map((c) => c[0].action);
    expect(actions.filter((a) => a === 'USER_CREATE')).toHaveLength(3);
    expect(actions.filter((a) => a === 'GROUP_CREATE')).toHaveLength(2);
    expect(actions.filter((a) => a === 'USER_BULK_IMPORT')).toHaveLength(1);
  });

  it('previewToken 이 없으면 거부한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    await expect(
      s.service.bulkImport(
        { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: false, skipExisting: false },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_STALE' } });
  });

  it('파일 내용에 오류가 남아 있으면 400 으로 거부한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    await expect(
      s.service.bulkImport(
        {
          text: '- 김하나, 이름',
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: false,
          previewToken: 'x',
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_INVALID' } });
    expect(s.users).toHaveLength(1);
  });

  it('중복이 있는데 skipExisting 이 거짓이면 400 으로 거부하고 아무것도 만들지 않는다', async () => {
    const s = buildService({
      users: [userRow({ id: 'u1' }), userRow({ id: 'x', username: 'gigu02' })],
    });
    const p = await preview(s);
    await expect(
      s.service.bulkImport(
        {
          text: IMPORT_TEXT,
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: false,
          previewToken: p.previewToken,
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_DUPLICATE' } });
    expect(s.groupRows).toHaveLength(0);
    expect(s.users).toHaveLength(2);
  });

  it('skipExisting 이 참이면 겹치는 사람만 건너뛴다', async () => {
    const s = buildService({
      users: [userRow({ id: 'u1' }), userRow({ id: 'x', username: 'gigu02' })],
    });
    const p = await preview(s, true);
    const r = await s.service.bulkImport(
      {
        text: IMPORT_TEXT,
        initialPassword: 'Init!2026',
        dryRun: false,
        skipExisting: true,
        previewToken: p.previewToken,
      },
      IMPORT_CTX,
    );
    expect(r.createdUserCount).toBe(2);
    expect(r.skippedUserCount).toBe(1);
  });
});

describe('UsersService.bulkImport() — 미리보기와 적용 사이의 경합', () => {
  it('그 사이 다른 사람이 같은 아이디를 만들면 409 로 거부한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await s.service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: true },
      IMPORT_CTX,
    );
    // 미리보기와 적용 사이에 다른 경로로 계정이 생긴 상황
    s.users.push(userRow({ id: 'other', username: 'gigu02' }));

    await expect(
      s.service.bulkImport(
        {
          text: IMPORT_TEXT,
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: true,
          previewToken: p.previewToken,
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_STALE' } });
    // skipExisting 이 참이어도 조용히 한 명을 덜 만들지 않는다 — 이것이 이 시험의 요지다
    expect(s.users.filter((u) => u.username === 'gigu01')).toHaveLength(0);
    expect(s.groupRows).toHaveLength(0);
  });

  it('그 사이 같은 이름의 그룹이 생기면 409 로 거부한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await s.service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    s.groupRows.push({
      id: 'g-new',
      name: '운영기술센터',
      parentId: null,
      description: null,
      createdAt: T0,
      updatedAt: T0,
    });

    await expect(
      s.service.bulkImport(
        {
          text: IMPORT_TEXT,
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: false,
          previewToken: p.previewToken,
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_STALE' } });
  });

  it('낡은 previewToken 이면 409 로 거부한다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    await expect(
      s.service.bulkImport(
        {
          text: IMPORT_TEXT,
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: false,
          previewToken: 'stale',
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_STALE' } });
  });

  it('검사를 모두 지나고 유일 제약에 걸려도 409 로 바꿔 준다', async () => {
    const s = buildService({ users: [userRow({ id: 'u1' })] });
    const p = await s.service.bulkImport(
      { text: IMPORT_TEXT, initialPassword: 'Init!2026', dryRun: true, skipExisting: false },
      IMPORT_CTX,
    );
    // 대조는 통과하지만 삽입이 P2002 로 실패하는 상황을 흉내 낸다
    s.prismaObject.user.create = vi.fn(async () => {
      const err = new Error('Unique constraint failed') as Error & { code: string };
      err.code = 'P2002';
      throw err;
    });

    await expect(
      s.service.bulkImport(
        {
          text: IMPORT_TEXT,
          initialPassword: 'Init!2026',
          dryRun: false,
          skipExisting: false,
          previewToken: p.previewToken,
        },
        IMPORT_CTX,
      ),
    ).rejects.toMatchObject({ response: { error: 'BULK_IMPORT_STALE' } });
  });
});
