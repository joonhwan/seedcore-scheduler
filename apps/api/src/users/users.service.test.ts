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
 * 아홉 갈래의 건수를 통째로 받아 대역을 만든다. 키를 빠뜨리면 0 으로 본다.
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
}

function buildService(seed: { users?: UserRow[]; counts?: Counts } = {}) {
  const users = [...(seed.users ?? [userRow({ id: 'u1' })])];
  const c = seed.counts ?? {};
  const auditRows: { actorId: string | null }[] = [];
  const deleted: string[] = [];

  const prismaObject = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      ),
      findMany: vi.fn(async () => users),
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
          const row = users.find((u) => u.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = users.findIndex((u) => u.id === where.id);
        deleted.push(where.id);
        return users.splice(i, 1)[0]!;
      }),
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
    },
    project: { count: vi.fn(async () => c.createdProjects ?? 0) },
    scheduleNode: {
      count: vi.fn(async ({ where }: { where: { createdById?: string; updatedById?: string } }) =>
        where.updatedById !== undefined ? (c.nodesUpdated ?? 0) : (c.nodesCreated ?? 0),
      ),
    },
    nodeComment: { count: vi.fn(async () => c.comments ?? 0) },
    nodeHistory: { count: vi.fn(async () => c.history ?? 0) },
    auditLog: {
      updateMany: vi.fn(async () => {
        auditRows.push({ actorId: null });
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };

  const prisma = prismaObject as unknown as PrismaService;
  const auth = {} as AuthService;
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
  };
}

describe('UsersService.activity()', () => {
  it('아홉 갈래가 모두 0 이면 삭제할 수 있다', async () => {
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

  it('없는 사용자는 USER_NOT_FOUND 다', async () => {
    const { service } = buildService();
    await expect(service.activity('missing')).rejects.toMatchObject({
      response: { error: 'USER_NOT_FOUND' },
    });
  });
});

const CTX = { actorId: 'admin1', ip: '127.0.0.1', userAgent: 'test' };

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
