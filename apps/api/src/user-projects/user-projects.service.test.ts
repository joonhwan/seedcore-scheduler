import { describe, expect, it, vi } from 'vitest';
import { UserProjectsService } from './user-projects.service';
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

function buildService(seed: { members?: PmRow[]; projectIds?: string[] } = {}) {
  const members = [...(seed.members ?? [])];
  const projectIds = seed.projectIds ?? ['p1', 'p2'];

  const prismaObject = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'missing' ? null : { id: where.id, username: where.id, displayName: where.id },
      ),
    },
    project: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => projectIds.includes(id))
          .map((id) => ({ id, name: id, status: 'ACTIVE' })),
      ),
    },
    projectMember: {
      findMany: vi.fn(async ({ where }: { where: { userId?: string } }) =>
        members
          .filter((m) => where.userId === undefined || m.userId === where.userId)
          .map((m) => ({
            ...m,
            project: { id: m.projectId, name: m.projectId, status: 'ACTIVE' },
          })),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { projectId_userId: { projectId: string; userId: string } } }) =>
          members.find(
            (m) =>
              m.projectId === where.projectId_userId.projectId &&
              m.userId === where.projectId_userId.userId,
          ) ?? null,
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: { projectId: string; role: string; userId: { not: string } };
        }) =>
          members.filter(
            (m) =>
              m.projectId === where.projectId &&
              m.role === where.role &&
              m.userId !== where.userId.not,
          ).length,
      ),
      createMany: vi.fn(async ({ data }: { data: PmRow[] }) => {
        for (const row of data) members.push({ ...row, addedAt: T0 });
        return { count: data.length };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { projectId_userId: { projectId: string; userId: string } };
          data: { role: 'MANAGER' | 'MEMBER' };
        }) => {
          const row = members.find(
            (m) =>
              m.projectId === where.projectId_userId.projectId &&
              m.userId === where.projectId_userId.userId,
          )!;
          row.role = data.role;
          return row;
        },
      ),
      delete: vi.fn(
        async ({
          where,
        }: {
          where: { projectId_userId: { projectId: string; userId: string } };
        }) => {
          const i = members.findIndex(
            (m) =>
              m.projectId === where.projectId_userId.projectId &&
              m.userId === where.projectId_userId.userId,
          );
          return members.splice(i, 1)[0]!;
        },
      ),
    },
    userGroupMember: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaObject)),
  };

  const prisma = prismaObject as unknown as PrismaService;
  const audit = { log: vi.fn(async () => {}) } as unknown as AuditService;
  return { service: new UserProjectsService(prisma, audit), audit, members };
}

const CTX = { actorId: 'admin-1', adminMode: false };
const ADMIN_MODE_CTX = { actorId: 'admin-1', adminMode: true };

describe('UserProjectsService.addProjects', () => {
  it('이미 참여 중인 프로젝트는 건너뛰고 결과에 담는다', async () => {
    const { service } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 }],
    });
    const result = await service.addProjects(
      'u1',
      { projectIds: ['p1', 'p2'], role: 'MEMBER' },
      CTX,
    );
    expect(result).toEqual({ added: 1, skipped: 1, skippedProjectIds: ['p1'] });
  });

  it('없는 프로젝트가 섞이면 거부한다', async () => {
    const { service } = buildService();
    await expect(
      service.addProjects('u1', { projectIds: ['nope'], role: 'MEMBER' }, CTX),
    ).rejects.toMatchObject({ response: { error: 'PROJECT_NOT_FOUND' } });
  });

  it('없는 사용자면 거부한다', async () => {
    const { service } = buildService();
    await expect(
      service.addProjects('missing', { projectIds: ['p1'], role: 'MEMBER' }, CTX),
    ).rejects.toMatchObject({ response: { error: 'USER_NOT_FOUND' } });
  });

  it('사람마다 MEMBER_ADD 를 남긴다', async () => {
    const { service, audit } = buildService();
    await service.addProjects('u1', { projectIds: ['p1'], role: 'MEMBER' }, CTX);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMBER_ADD' }));
  });

  it('관리자 모드면 ADMIN_OVERRIDE_EDIT 를 함께 남긴다', async () => {
    const { service, audit } = buildService();
    await service.addProjects('u1', { projectIds: ['p1'], role: 'MEMBER' }, ADMIN_MODE_CTX);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_OVERRIDE_EDIT' }),
    );
  });
});

describe('UserProjectsService.removeProject', () => {
  it('마지막 MANAGER 는 뺄 수 없다', async () => {
    const { service } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MANAGER', addedById: 'a', addedAt: T0 }],
    });
    await expect(service.removeProject('u1', 'p1', CTX)).rejects.toMatchObject({
      response: { error: 'LAST_MANAGER' },
    });
  });

  it('MANAGER 가 둘이면 뺄 수 있다', async () => {
    const { service, members } = buildService({
      members: [
        { projectId: 'p1', userId: 'u1', role: 'MANAGER', addedById: 'a', addedAt: T0 },
        { projectId: 'p1', userId: 'u2', role: 'MANAGER', addedById: 'a', addedAt: T0 },
      ],
    });
    await service.removeProject('u1', 'p1', CTX);
    expect(members).toHaveLength(1);
  });

  it('MEMBER 는 그냥 뺀다', async () => {
    const { service, members } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 }],
    });
    await service.removeProject('u1', 'p1', CTX);
    expect(members).toHaveLength(0);
  });

  it('참여 중이 아니면 404', async () => {
    const { service } = buildService();
    await expect(service.removeProject('u1', 'p1', CTX)).rejects.toMatchObject({
      response: { error: 'NOT_A_MEMBER' },
    });
  });
});

describe('UserProjectsService.updateRole', () => {
  it('마지막 MANAGER 를 MEMBER 로 낮출 수 없다', async () => {
    const { service } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MANAGER', addedById: 'a', addedAt: T0 }],
    });
    await expect(service.updateRole('u1', 'p1', { role: 'MEMBER' }, CTX)).rejects.toMatchObject({
      response: { error: 'LAST_MANAGER' },
    });
  });

  it('관리자 모드가 아니면 자기 역할을 바꿀 수 없다', async () => {
    const { service } = buildService({
      members: [
        {
          projectId: 'p1',
          userId: 'admin-1',
          role: 'MEMBER',
          addedById: 'a',
          addedAt: T0,
        },
      ],
    });
    await expect(
      service.updateRole('admin-1', 'p1', { role: 'MANAGER' }, CTX),
    ).rejects.toMatchObject({ response: { error: 'CANNOT_CHANGE_SELF_ROLE' } });
  });

  it('관리자 모드면 자기 역할도 바꿀 수 있다', async () => {
    const { service } = buildService({
      members: [
        {
          projectId: 'p1',
          userId: 'admin-1',
          role: 'MEMBER',
          addedById: 'a',
          addedAt: T0,
        },
      ],
    });
    const updated = await service.updateRole('admin-1', 'p1', { role: 'MANAGER' }, ADMIN_MODE_CTX);
    expect(updated.role).toBe('MANAGER');
  });

  it('MEMBER 를 MANAGER 로 올리는 것은 언제나 통과한다', async () => {
    const { service } = buildService({
      members: [{ projectId: 'p1', userId: 'u1', role: 'MEMBER', addedById: 'a', addedAt: T0 }],
    });
    const updated = await service.updateRole('u1', 'p1', { role: 'MANAGER' }, CTX);
    expect(updated.role).toBe('MANAGER');
  });
});
