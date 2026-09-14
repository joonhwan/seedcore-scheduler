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
        async ({ where }: { where: { id: { in: string[] }; isActive?: boolean } }) => {
          // seed.users 를 주지 않으면 요청받은 id 를 무조건 활성 사용자로 합성한다
          // (INVALID_*_IDS 분기를 보지 않는 기존 통과 경로 시험용).
          if (users === undefined) {
            return where.id.in.map((id) => ({ id }));
          }
          return where.id.in
            .map((id) => users.find((u) => u.id === id))
            .filter(
              (u): u is UserRow =>
                u !== undefined && (where.isActive === undefined || u.isActive === where.isActive),
            )
            .map((u) => ({ id: u.id }));
        },
      ),
    },
    project: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            id: string;
            name: string;
            description: string | null;
            status: string;
            createdById: string;
          };
        }) => ({
          ...data,
          // 실제 DB 는 data 에 없는 컬럼도 컬럼 기본값으로 채워 돌려준다. priority 는
          // CreateProjectDto 가 받지 않으므로 여기서도 실제와 같이 기본값 0 을 흉내 낸다.
          priority: 0,
          createdAt: T0,
          updatedAt: T0,
        }),
      ),
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
      service.create({ name: 'proj', managerUserIds: ['u1'], memberUserIds: ['u2'] }, CTX),
    ).rejects.toMatchObject({ response: { error: 'INVALID_MEMBER_IDS', missing: ['u2'] } });
  });

  it('memberUserIds 에 존재하지 않는 사용자가 섞이면 INVALID_MEMBER_IDS 로 거부한다', async () => {
    const { service } = buildService({ users: [{ id: 'u1', isActive: true }] });
    await expect(
      service.create({ name: 'proj', managerUserIds: ['u1'], memberUserIds: ['ghost'] }, CTX),
    ).rejects.toMatchObject({ response: { error: 'INVALID_MEMBER_IDS', missing: ['ghost'] } });
  });

  it('memberUserIds 를 보내지 않은 기존 형태의 호출도 그대로 동작한다', async () => {
    const { service, createdMembers, audit } = buildService();
    const result = await service.create(
      { name: 'proj', managerUserIds: ['u1'], memberUserIds: [] },
      CTX,
    );
    expect(result.name).toBe('proj');
    expect(createdMembers).toEqual([expect.objectContaining({ userId: 'u1', role: 'MANAGER' })]);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROJECT_CREATE',
        payload: expect.objectContaining({ managerUserIds: ['u1'], memberUserIds: [] }),
      }),
    );
  });

  it('MANAGER 둘과 MEMBER 셋으로 만들면 memberCount 가 5다 (겹치는 사람은 한 번만)', async () => {
    const { service } = buildService();
    const result = await service.create(
      {
        name: 'proj',
        managerUserIds: ['m1', 'm2'],
        // m1 은 MANAGER 에도 있으므로 memberIds 에서 걸러져 한 번만 세여야 한다.
        memberUserIds: ['m1', 'u1', 'u2', 'u3'],
      },
      CTX,
    );
    expect(result.memberCount).toBe(5);
  });

  it('만든 사람이 memberUserIds 에만 있으면 myRole 이 MEMBER 다', async () => {
    const { service } = buildService();
    const asMember = await service.create(
      { name: 'proj', managerUserIds: ['other'], memberUserIds: ['admin-1'] },
      CTX,
    );
    expect(asMember.myRole).toBe('MEMBER');

    const asManager = await service.create(
      { name: 'proj', managerUserIds: ['admin-1'], memberUserIds: [] },
      CTX,
    );
    expect(asManager.myRole).toBe('MANAGER');

    const asNeither = await service.create(
      { name: 'proj', managerUserIds: ['other'], memberUserIds: [] },
      CTX,
    );
    expect(asNeither.myRole).toBeNull();
  });

  it('managerUserIds 가 비면 MANAGER_REQUIRED', async () => {
    const { service } = buildService();
    await expect(
      service.create({ name: 'proj', managerUserIds: [], memberUserIds: [] }, CTX),
    ).rejects.toMatchObject({ response: { error: 'MANAGER_REQUIRED' } });
  });

  it('새로 만든 프로젝트의 priority 는 0(보통)이다', async () => {
    const { service } = buildService();
    const result = await service.create(
      { name: 'proj', managerUserIds: ['u1'], memberUserIds: [] },
      CTX,
    );
    expect(result.priority).toBe(0);
  });
});

/**
 * ProjectsService.update() 전용 가짜다. buildService() 는 create() 만 흉내 내므로
 * project.findUnique / project.update / projectMember.findUnique 가 없다 — update() 가
 * 그 셋을 그대로 쓰므로 여기서 새로 짓는다.
 *
 * 프로젝트 한 건과 그 멤버 한 명을 심고 { service, project } 를 돌려준다. project.update() 는
 * data 를 기존 행에 병합하고 updatedAt 을 한 틱 앞으로 미는 것으로 실제 DB 갱신을 흉내 낸다.
 * include.members.where.userId 를 그대로 읽어, 응답에 실리는 myRole 이 "글을 쓴 사람"이 아니라
 * "그 include 를 요청한 ctx.actorId" 기준이 되게 한다 — 실제 Prisma 동작과 같다.
 */
function buildProjectWithMember(userId: string, role: 'MANAGER' | 'MEMBER') {
  const projectId = 'p1';
  let current = {
    id: projectId,
    name: '기존 이름',
    description: '기존 설명',
    status: 'ACTIVE',
    priority: 0,
    createdById: 'creator',
    createdAt: T0,
    updatedAt: T0,
  };

  const members = new Map<string, { projectId: string; userId: string; role: 'MANAGER' | 'MEMBER' }>();
  members.set(userId, { projectId, userId, role });

  const prismaObject = {
    project: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === current.id ? { ...current } : null,
      ),
      update: vi.fn(
        async ({
          data,
          include,
        }: {
          data: Record<string, unknown>;
          include: { members: { where: { userId: string } } };
        }) => {
          current = {
            ...current,
            ...data,
            updatedAt: new Date(current.updatedAt.getTime() + 1000),
          } as typeof current;
          const m = members.get(include.members.where.userId);
          return {
            ...current,
            members: m ? [{ role: m.role }] : [],
            _count: { members: members.size },
          };
        },
      ),
    },
    projectMember: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { projectId_userId: { projectId: string; userId: string } };
        }) => {
          const m = members.get(where.projectId_userId.userId);
          if (!m || m.projectId !== where.projectId_userId.projectId) return null;
          return { role: m.role };
        },
      ),
    },
    nodeHistory: {
      // lastScheduleChangeAt() 이 update() 끝에서 부른다 — 일정 변경 이력이 없는 상태를 흉내 낸다.
      findFirst: vi.fn(async () => null),
    },
  };

  const auditLogs: Array<Record<string, unknown>> = [];
  const prisma = prismaObject as unknown as PrismaService;
  const audit = {
    log: vi.fn(async (entry: Record<string, unknown>) => {
      auditLogs.push(entry);
    }),
  } as unknown as AuditService;
  const service = new ProjectsService(prisma, audit);
  return { service, project: current, prismaObject, auditLogs };
}

describe('ProjectsService.update — 필드별 권한', () => {
  it('MANAGER 가 명칭·설명·중요도를 고칠 수 있다', async () => {
    const { service, project } = buildProjectWithMember('u1', 'MANAGER');

    const result = await service.update(
      project.id,
      {
        name: '새 이름',
        description: '새 설명',
        priority: 2,
        expectedUpdatedAt: project.updatedAt.toISOString(),
      },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    expect(result.name).toBe('새 이름');
    expect(result.priority).toBe(2);
  });

  it('MANAGER 가 보관 상태를 바꾸려 하면 요청 전체를 거부한다', async () => {
    // 일부만 반영하면 무엇이 적용되고 무엇이 무시됐는지 화면이 알 수 없다.
    const { service, project } = buildProjectWithMember('u1', 'MANAGER');

    await expect(
      service.update(
        project.id,
        {
          name: '새 이름',
          status: 'ARCHIVED',
          expectedUpdatedAt: project.updatedAt.toISOString(),
        },
        { actorId: 'u1', globalRole: 'USER', adminMode: false },
      ),
    ).rejects.toMatchObject({ response: { error: 'FORBIDDEN_FIELD' } });
  });

  it('MEMBER 는 고칠 수 없다', async () => {
    const { service, project } = buildProjectWithMember('u1', 'MEMBER');

    await expect(
      service.update(
        project.id,
        { priority: 1, expectedUpdatedAt: project.updatedAt.toISOString() },
        { actorId: 'u1', globalRole: 'USER', adminMode: false },
      ),
    ).rejects.toMatchObject({ response: { error: 'NOT_A_MANAGER' } });
  });

  it('관리자 모드를 켠 ADMIN 은 멤버가 아니어도 고칠 수 있다', async () => {
    const { service, project } = buildProjectWithMember('someone', 'MANAGER');

    const result = await service.update(
      project.id,
      { priority: 3, expectedUpdatedAt: project.updatedAt.toISOString() },
      { actorId: 'admin', globalRole: 'ADMIN', adminMode: true },
    );

    expect(result.priority).toBe(3);
  });

  it('관리자 모드를 끈 ADMIN 은 남의 프로젝트를 고칠 수 없다', async () => {
    // AGENTS.md §4.4 — ADMIN 의 전체 권한은 관리자 모드에서만 열린다.
    const { service, project } = buildProjectWithMember('someone', 'MANAGER');

    await expect(
      service.update(
        project.id,
        { priority: 3, expectedUpdatedAt: project.updatedAt.toISOString() },
        { actorId: 'admin', globalRole: 'ADMIN', adminMode: false },
      ),
    ).rejects.toMatchObject({ response: { error: 'NOT_A_MANAGER' } });
  });

  it('관리자 모드의 ADMIN 은 보관 상태도 바꿀 수 있다', async () => {
    const { service, project } = buildProjectWithMember('someone', 'MANAGER');

    const result = await service.update(
      project.id,
      { status: 'ARCHIVED', expectedUpdatedAt: project.updatedAt.toISOString() },
      { actorId: 'admin', globalRole: 'ADMIN', adminMode: true },
    );

    expect(result.status).toBe('ARCHIVED');
  });
});

describe('ProjectsService.update — 변경 이력', () => {
  it('바뀐 필드마다 이전 값과 새 값을 함께 남긴다', async () => {
    // 기록하는 그 순간에만 알 수 있는 정보다. 지금 담지 않으면 나중에 이력 화면에서
    // "보통에서 높음으로 올렸다" 를 복원할 방법이 없다.
    const { service, project, auditLogs } = buildProjectWithMember('u1', 'MANAGER');

    await service.update(
      project.id,
      {
        name: '새 이름',
        priority: 2,
        expectedUpdatedAt: project.updatedAt.toISOString(),
      },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    const entry = auditLogs.find((l) => l.action === 'PROJECT_UPDATE');
    expect(entry?.payload).toEqual({
      name: { before: project.name, after: '새 이름' },
      priority: { before: 0, after: 2 },
    });
  });

  it('바뀌지 않은 필드는 담지 않는다', async () => {
    const { service, project, auditLogs } = buildProjectWithMember('u1', 'MANAGER');

    await service.update(
      project.id,
      { priority: 1, expectedUpdatedAt: project.updatedAt.toISOString() },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    const entry = auditLogs.find((l) => l.action === 'PROJECT_UPDATE');
    expect(entry?.payload).toEqual({ priority: { before: 0, after: 1 } });
  });

  it('요청에 필드가 있어도 값이 기존과 같으면 담지 않는다', async () => {
    // "필드가 patch 에 없는 경우" 와 구별해야 한다 — 여기서는 name 이 patch 에
    // 분명히 들어 있지만 target.name 과 같은 값('기존 이름')이라 바뀐 것이 아니다.
    // 함께 보낸 priority 는 실제로 바뀌므로 그것만 payload 에 남아야 한다.
    const { service, project, auditLogs } = buildProjectWithMember('u1', 'MANAGER');

    await service.update(
      project.id,
      {
        name: project.name,
        priority: 5,
        expectedUpdatedAt: project.updatedAt.toISOString(),
      },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    const entry = auditLogs.find((l) => l.action === 'PROJECT_UPDATE');
    expect(entry?.payload).toEqual({ priority: { before: 0, after: 5 } });
  });

  it('description 의 이전 값과 새 값도 함께 남긴다 (null 사이 전환 포함)', async () => {
    const { service, project, auditLogs } = buildProjectWithMember('u1', 'MANAGER');

    const afterFirst = await service.update(
      project.id,
      { description: null, expectedUpdatedAt: project.updatedAt.toISOString() },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    const firstEntry = auditLogs.find((l) => l.action === 'PROJECT_UPDATE');
    expect(firstEntry?.payload).toEqual({
      description: { before: project.description, after: null },
    });

    await service.update(
      project.id,
      { description: '새 설명', expectedUpdatedAt: afterFirst.updatedAt },
      { actorId: 'u1', globalRole: 'USER', adminMode: false },
    );

    const secondEntry = auditLogs.filter((l) => l.action === 'PROJECT_UPDATE')[1];
    expect(secondEntry?.payload).toEqual({
      description: { before: null, after: '새 설명' },
    });
  });
});
