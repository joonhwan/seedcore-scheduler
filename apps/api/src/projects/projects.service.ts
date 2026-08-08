import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  NodeDelayInput,
  CloneProjectDto,
  CloneProjectResult,
  CreateProjectDto,
  ProjectDetail,
  ProjectListItem,
  ProjectRole,
  UpdateProjectDto,
} from '@sam/shared';
import { buildRemapPlan, findDateSpan, calculateProjectDelaySummary } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildClonedNodes } from './clone-tree';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 가시성 필터:

   *  - ADMIN + adminMode=true → 모든 프로젝트
   *  - 그 외 → 본인이 멤버인 프로젝트만
   */
  async list(ctx: ActorContext): Promise<ProjectListItem[]> {
    const isAdminBrowsing = ctx.globalRole === 'ADMIN' && ctx.adminMode;
    const projects = await this.prisma.project.findMany({
      where: isAdminBrowsing
        ? {}
        : { members: { some: { userId: ctx.actorId } } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true, nodes: true } },
        // 지연 요약에 필요한 최소한만 읽는다 — DELAY_SUMMARY_NODE_QUERY 주석 참고.
        // 예전에는 nodes: true 로 전 컬럼을 통째로 읽고 buildTreeItems 로 트리까지 만들었다.
        // 프로젝트 500 개 × 노드 5,000 개 상한을 곱하면 목록 화면 한 번에 최대 250 만 행이다.
        nodes: DELAY_SUMMARY_NODE_QUERY,
      },
      take: 500,
    });

    return projects.map((p) => {
      const delaySummary = summarizeDelay(p.nodes, p._count.nodes);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: (p.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
          | 'ACTIVE'
          | 'ARCHIVED',
        myRole: roleOf(p.members[0]?.role ?? null),
        memberCount: p._count.members,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        delaySummary,
      };
    });
  }

  async getById(id: string, ctx: ActorContext): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true, nodes: true } },
        nodes: DELAY_SUMMARY_NODE_QUERY,
      },
    });
    if (!project) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    const isMember = project.members.length > 0;
    const isAdminBrowsing = ctx.globalRole === 'ADMIN' && ctx.adminMode;
    if (!isMember && !isAdminBrowsing) {
      throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
    }

    const delaySummary = summarizeDelay(project.nodes, project._count.nodes);

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: (project.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
        | 'ACTIVE'
        | 'ARCHIVED',
      myRole: roleOf(project.members[0]?.role ?? null),
      memberCount: project._count.members,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      createdById: project.createdById,
      delaySummary,
    };
  }


  async create(input: CreateProjectDto, ctx: ActorContext): Promise<ProjectDetail> {
    const uniqueIds = Array.from(new Set(input.managerUserIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException({ error: 'MANAGER_REQUIRED' });
    }

    const found = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      const foundSet = new Set(found.map((u) => u.id));
      const missing = uniqueIds.filter((id) => !foundSet.has(id));
      throw new BadRequestException({
        error: 'INVALID_MANAGER_IDS',
        missing,
      });
    }

    const projectId = randomUUID();
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          id: projectId,
          name: input.name,
          description: input.description ?? null,
          status: 'ACTIVE',
          createdById: ctx.actorId,
        },
      });
      await tx.projectMember.createMany({
        data: uniqueIds.map((userId) => ({
          projectId: proj.id,
          userId,
          role: 'MANAGER',
          addedById: ctx.actorId,
          addedAt: now,
        })),
      });
      return proj;
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_CREATE',
      targetType: 'project',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        name: created.name,
        managerUserIds: uniqueIds,
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_CREATE' },
      });
    }

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      status: 'ACTIVE',
      myRole: uniqueIds.includes(ctx.actorId) ? 'MANAGER' : null,
      memberCount: uniqueIds.length,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      createdById: created.createdById,
    };
  }

  async update(
    id: string,
    patch: UpdateProjectDto,
    ctx: ActorContext,
  ): Promise<ProjectDetail> {
    const target = await this.prisma.project.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    if (target.updatedAt.toISOString() !== patch.expectedUpdatedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Project has been modified by another user',
        currentUpdatedAt: target.updatedAt.toISOString(),
      });
    }

    const previousStatus = target.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
    const nextStatus = patch.status ?? previousStatus;

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.status !== undefined) data.status = patch.status;

    const updated = await this.prisma.project.update({
      where: { id },
      data,
      include: {
        members: {
          where: { userId: ctx.actorId },
          select: { role: true },
        },
        _count: { select: { members: true } },
      },
    });

    if (patch.status !== undefined && previousStatus !== nextStatus) {
      const action =
        nextStatus === 'ARCHIVED' ? 'PROJECT_ARCHIVE' : 'PROJECT_RESTORE';
      await this.audit.log({
        actorId: ctx.actorId,
        action,
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } else {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'PROJECT_UPDATE',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined
            ? { description: patch.description }
            : {}),
        },
      });
    }
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_UPDATE' },
      });
    }

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: (updated.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE') as
        | 'ACTIVE'
        | 'ARCHIVED',
      myRole: roleOf(updated.members[0]?.role ?? null),
      memberCount: updated._count.members,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      createdById: updated.createdById,
    };
  }

  /**
   * Hard delete. Project.status === 'ARCHIVED' 일 때만 가능.
   * 활성 프로젝트는 먼저 PATCH 로 ARCHIVED 전환 후 삭제.
   */
  async hardDelete(id: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.project.findUnique({ where: { id } });
    if (!target) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
    if (target.status !== 'ARCHIVED') {
      throw new ConflictException({
        error: 'NOT_ARCHIVED',
        message: 'Archive the project (PATCH status=ARCHIVED) before deleting',
      });
    }

    // schema.prisma 의 onDelete: Cascade 가 members/nodes/comments/history 까지 처리.
    await this.prisma.project.delete({ where: { id } });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_DELETE',
      targetType: 'project',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { name: target.name },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_DELETE' },
      });
    }
  }

  /**
   * 프로젝트 복제. 일정 트리를 그대로 물려받고 날짜만 새 기간으로 옮긴다.
   *
   * 멤버 승계는 클라이언트가 원본 멤버 목록을 프리필해 보내는 방식이다. 서버가 원본을
   * 다시 읽어 병합하지 않으므로 요청만 보면 결과가 예측되고, 매니저 교체가 목록을
   * 바꿔 보내는 것으로 해결된다.
   *
   * 진행률은 전부 0 으로 초기화하고 댓글과 원본 이력은 복사하지 않는다.
   */
  async clone(
    sourceId: string,
    input: CloneProjectDto,
    ctx: ActorContext,
  ): Promise<CloneProjectResult> {
    const source = await this.prisma.project.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    const managerIds = Array.from(new Set(input.managerUserIds));
    if (managerIds.length === 0) {
      throw new BadRequestException({ error: 'MANAGER_REQUIRED' });
    }
    // 같은 사람이 양쪽에 오면 MANAGER 를 우선한다 (project_members 의 복합 PK 중복 방지).
    const managerSet = new Set(managerIds);
    const memberIds = Array.from(new Set(input.memberUserIds)).filter(
      (id) => !managerSet.has(id),
    );

    const allIds = [...managerIds, ...memberIds];
    const found = await this.prisma.user.findMany({
      where: { id: { in: allIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== allIds.length) {
      const foundSet = new Set(found.map((u) => u.id));
      const missing = allIds.filter((id) => !foundSet.has(id));
      // 매니저 쪽에 없는 ID 가 하나라도 있으면 INVALID_MANAGER_IDS 를 우선한다 — 매니저가
      // 없으면 복제 자체가 불가능하므로 그쪽이 더 중요한 정보다 (create() 와 동일한 관례).
      const missingHasManager = missing.some((id) => managerSet.has(id));
      throw new BadRequestException({
        error: missingHasManager ? 'INVALID_MANAGER_IDS' : 'INVALID_MEMBER_IDS',
        missing,
      });
    }

    const sourceNodes = await this.prisma.scheduleNode.findMany({
      where: { projectId: sourceId },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        sortOrder: true,
        depth: true,
      },
    });

    // span 은 ITEM 에서만 뽑는다. GROUP 은 DB 에 날짜가 비어 있다 (AGENTS.md §4.6).
    const span = findDateSpan(sourceNodes.filter((n) => n.kind === 'ITEM'));
    if (input.dateMode !== 'KEEP' && span === null) {
      throw new BadRequestException({
        error: 'NO_DATED_ITEMS',
        message:
          '원본 프로젝트에 날짜가 지정된 일정이 없어 일정을 옮길 수 없습니다. 원본 일정 유지로 복제하십시오.',
      });
    }
    const plan = buildRemapPlan(span, {
      mode: input.dateMode,
      ...(input.newStartDate !== undefined ? { newStartDate: input.newStartDate } : {}),
      ...(input.newEndDate !== undefined ? { newEndDate: input.newEndDate } : {}),
    });

    const newProjectId = randomUUID();
    const cloned = buildClonedNodes({
      sourceNodes,
      newProjectId,
      actorId: ctx.actorId,
      plan,
      newId: randomUUID,
    });

    const now = new Date();
    const created = await this.prisma.$transaction(
      async (tx) => {
        const proj = await tx.project.create({
          data: {
            id: newProjectId,
            name: input.name,
            description: input.description ?? null,
            // 보관된 지난 호기를 템플릿으로 써도 새 호기는 활성 상태로 시작한다.
            status: 'ACTIVE',
            createdById: ctx.actorId,
          },
        });

        await tx.projectMember.createMany({
          data: [
            ...managerIds.map((userId) => ({
              projectId: newProjectId,
              userId,
              role: 'MANAGER',
              addedById: ctx.actorId,
              addedAt: now,
            })),
            ...memberIds.map((userId) => ({
              projectId: newProjectId,
              userId,
              role: 'MEMBER',
              addedById: ctx.actorId,
              addedAt: now,
            })),
          ],
        });

        // parent_id 가 자기참조 FK 라 부모 행이 먼저 있어야 한다. createMany 는 배열 순서
        // 삽입을 보장하지 않으므로 depth 별로 호출을 쪼갠다. 최대 깊이 5 라서 5 회로 끝난다.
        const maxDepth = cloned.reduce((m, n) => Math.max(m, n.depth), 0);
        for (let d = 0; d <= maxDepth; d += 1) {
          const batch = cloned.filter((n) => n.depth === d);
          if (batch.length === 0) continue;
          await tx.scheduleNode.createMany({
            // sourceNodeId 는 DB 컬럼이 아니므로 떼어낸다.
            data: batch.map(({ sourceNodeId: _drop, ...row }) => row),
          });
        }

        if (cloned.length > 0) {
          await tx.nodeHistory.createMany({
            data: cloned.map((n) => ({
              id: randomUUID(),
              nodeId: n.id,
              nodeIdSnapshot: n.id,
              projectIdSnapshot: newProjectId,
              actorId: ctx.actorId,
              action: 'CREATE',
              diffJson: JSON.stringify({
                clonedFrom: { projectId: sourceId, nodeId: n.sourceNodeId },
              }),
            })),
          });
        }

        return proj;
      },
      // 노드 5,000 개 상한을 감안해 넉넉히 잡는다. SQLite 는 단일 writer 라 이 동안 다른 쓰기는 대기한다.
      { timeout: 30_000, maxWait: 10_000 },
    );

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_CLONE',
      targetType: 'project',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        sourceProjectId: sourceId,
        sourceProjectName: source.name,
        name: created.name,
        dateMode: input.dateMode,
        ...(input.newStartDate !== undefined ? { newStartDate: input.newStartDate } : {}),
        ...(input.newEndDate !== undefined ? { newEndDate: input.newEndDate } : {}),
        nodeCount: cloned.length,
        managerUserIds: managerIds,
        memberUserIds: memberIds,
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_CLONE' },
      });
    }

    return {
      project: {
        id: created.id,
        name: created.name,
        description: created.description,
        status: 'ACTIVE',
        myRole: managerSet.has(ctx.actorId)
          ? 'MANAGER'
          : memberIds.includes(ctx.actorId)
            ? 'MEMBER'
            : null,
        memberCount: managerIds.length + memberIds.length,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        createdById: created.createdById,
      },
      nodeCount: cloned.length,
    };
  }
}

/**
 * 지연 요약을 만들 때 노드에서 읽을 것 — **ITEM 의 날짜와 진척율뿐이다.**
 *
 * calculateProjectDelaySummary() 는 kind==='ITEM' 인 행만 골라 startAt/endAt/progress 로
 * 계산한다. GROUP 의 집계값(startAtEffective 등)은 쓰지 않으므로 buildTreeItems() 로 트리를
 * 만들 필요도, description·createdBy 같은 나머지 컬럼을 읽을 필요도 없다.
 * ITEM 은 startAtEffective===startAt, progressEffective===progress 라서 이 셋만으로
 * 트리를 만든 것과 결과가 같다 (getItemNodeDelayInfo 의 `??` 폴백이 그대로 받는다).
 */
const DELAY_SUMMARY_NODE_QUERY = {
  where: { kind: 'ITEM' },
  select: { startAt: true, endAt: true, progress: true },
} as const;

type DelaySummaryNode = { startAt: string | null; endAt: string | null; progress: number };

/**
 * 위 쿼리 결과로 프로젝트 지연 요약을 만든다.
 *
 * totalNodes 는 요약 함수가 "받은 배열의 길이" 로 채우는데, 우리는 ITEM 만 넘기므로
 * 그대로 두면 GROUP 이 빠진 수가 된다. _count 로 받은 진짜 전체 노드 수로 덮어쓴다.
 *
 * ITEM 이 하나도 없는 프로젝트(폴더만 만들어 둔 상태)는 GROUP 자리표를 넘겨 예전 동작을
 * 그대로 유지한다. 예전 코드는 이 경우 GROUP 들을 대상으로 요약을 계산해 ON_TRACK("정상
 * 진행 중")을 돌려줬다. 일정이 하나도 없는데 정상이라고 말하는 게 맞느냐는 따져볼 만하지만,
 * 성능 개선이 목록 화면의 배지를 조용히 바꾸는 것은 다른 문제다 — 판단은 분리한다.
 * (GROUP 의 progress 는 생성·수정·가져오기 모든 경로에서 0 으로 고정된다.)
 */
function summarizeDelay(itemNodes: DelaySummaryNode[], totalNodeCount: number) {
  const input: NodeDelayInput[] =
    itemNodes.length > 0
      ? itemNodes.map((n) => ({
          kind: 'ITEM' as const,
          startAt: n.startAt,
          endAt: n.endAt,
          progress: n.progress,
        }))
      : Array.from({ length: totalNodeCount }, () => ({
          kind: 'GROUP' as const,
          progress: 0,
          progressEffective: null,
        }));

  return { ...calculateProjectDelaySummary(input), totalNodes: totalNodeCount };
}

function roleOf(role: string | null): ProjectRole | null {
  if (role === 'MANAGER') return 'MANAGER';
  if (role === 'MEMBER') return 'MEMBER';
  return null;
}
