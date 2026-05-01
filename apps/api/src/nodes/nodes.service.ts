import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MAX_TREE_DEPTH,
  type CreateNodeDto,
  type MoveNodeDto,
  type NodeAction,
  type NodeTreeItem,
  type UpdateNodeDto,
} from '@sam/shared';
import { Prisma, type ScheduleNode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildTreeItems } from './tree-aggregation';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 프로젝트 전체 트리 (배열). GROUP 행에 effective 동봉.
   * 권한: 프로젝트 멤버 OR ADMIN+adminMode.
   */
  async listTree(projectId: string, ctx: ActorContext): Promise<NodeTreeItem[]> {
    await this.assertProjectExists(projectId);
    await this.assertReadAccess(projectId, ctx);

    const rows = await this.prisma.scheduleNode.findMany({
      where: { projectId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
    });
    return buildTreeItems(rows);
  }

  async create(
    projectId: string,
    body: CreateNodeDto,
    ctx: ActorContext,
  ): Promise<NodeTreeItem> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    let parentDepth = -1;
    if (body.parentId) {
      const parent = await this.prisma.scheduleNode.findUnique({
        where: { id: body.parentId },
      });
      if (!parent || parent.projectId !== projectId) {
        throw new BadRequestException({ error: 'INVALID_PARENT' });
      }
      parentDepth = parent.depth;
    }
    const depth = parentDepth + 1;
    if (depth >= MAX_TREE_DEPTH) {
      throw new BadRequestException({ error: 'MAX_DEPTH_EXCEEDED' });
    }

    // GROUP 은 startAt/endAt/progress 직접 입력 금지 (서버가 무시)
    const startAt = body.kind === 'GROUP' ? null : body.startAt ?? null;
    const endAt = body.kind === 'GROUP' ? null : body.endAt ?? null;
    const progress = body.kind === 'GROUP' ? 0 : body.progress ?? 0;

    const id = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      const maxSort = await tx.scheduleNode.aggregate({
        where: { projectId, parentId: body.parentId ?? null },
        _max: { sortOrder: true },
      });
      const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

      const node = await tx.scheduleNode.create({
        data: {
          id,
          projectId,
          parentId: body.parentId ?? null,
          kind: body.kind,
          title: body.title,
          description: body.description ?? null,
          startAt,
          endAt,
          progress,
          sortOrder: nextSort,
          depth,
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
      });
      await this.writeHistory(tx, {
        nodeId: id,
        projectId,
        actorId: ctx.actorId,
        action: 'CREATE',
        diff: {
          kind: { from: null, to: node.kind },
          title: { from: null, to: node.title },
          description: { from: null, to: node.description },
          parentId: { from: null, to: node.parentId },
          sortOrder: { from: null, to: node.sortOrder },
          depth: { from: null, to: node.depth },
          startAt: { from: null, to: node.startAt },
          endAt: { from: null, to: node.endAt },
          progress: { from: null, to: node.progress },
        },
      });
      return node;
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'NODE_CREATE',
      targetType: 'schedule_node',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { projectId, kind: created.kind, title: created.title },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'schedule_node',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'NODE_CREATE' },
      });
    }

    return this.toSingleTreeItem(created);
  }

  async update(
    nodeId: string,
    body: UpdateNodeDto,
    ctx: ActorContext,
  ): Promise<NodeTreeItem> {
    const target = await this.prisma.scheduleNode.findUnique({
      where: { id: nodeId },
    });
    if (!target) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
    await this.assertWriteAccess(target.projectId, ctx);

    if (target.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Node has been modified by another user',
        currentUpdatedAt: target.updatedAt.toISOString(),
      });
    }

    if (
      target.kind === 'GROUP' &&
      (body.startAt !== undefined || body.endAt !== undefined)
    ) {
      throw new BadRequestException({ error: 'GROUP_DATES_NOT_EDITABLE' });
    }
    if (target.kind === 'GROUP' && body.progress !== undefined) {
      throw new BadRequestException({ error: 'GROUP_PROGRESS_NOT_EDITABLE' });
    }

    // 결합된 startAt/endAt 검증 (한쪽만 바뀌어도 새 값 기준으로 검사)
    const nextStart =
      body.startAt !== undefined ? body.startAt : target.startAt;
    const nextEnd = body.endAt !== undefined ? body.endAt : target.endAt;
    if (nextStart !== null && nextEnd !== null && nextStart > nextEnd) {
      throw new BadRequestException({ error: 'START_AFTER_END' });
    }

    const data: Prisma.ScheduleNodeUncheckedUpdateInput = {
      updatedById: ctx.actorId,
    };
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (body.title !== undefined && body.title !== target.title) {
      data.title = body.title;
      diff.title = { from: target.title, to: body.title };
    }
    if (
      body.description !== undefined &&
      body.description !== target.description
    ) {
      data.description = body.description;
      diff.description = { from: target.description, to: body.description };
    }
    if (body.startAt !== undefined && body.startAt !== target.startAt) {
      data.startAt = body.startAt;
      diff.startAt = { from: target.startAt, to: body.startAt };
    }
    if (body.endAt !== undefined && body.endAt !== target.endAt) {
      data.endAt = body.endAt;
      diff.endAt = { from: target.endAt, to: body.endAt };
    }
    if (body.progress !== undefined && body.progress !== target.progress) {
      data.progress = body.progress;
      diff.progress = { from: target.progress, to: body.progress };
    }

    if (Object.keys(diff).length === 0) {
      // 변경사항 0 — 그대로 반환 (history/audit 도 남기지 않음)
      return this.toSingleTreeItem(target);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const node = await tx.scheduleNode.update({
        where: { id: nodeId },
        data,
      });
      await this.writeHistory(tx, {
        nodeId,
        projectId: target.projectId,
        actorId: ctx.actorId,
        action: 'UPDATE',
        diff,
      });
      return node;
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'NODE_UPDATE',
      targetType: 'schedule_node',
      targetId: nodeId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { projectId: target.projectId, fields: Object.keys(diff) },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'schedule_node',
        targetId: nodeId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'NODE_UPDATE' },
      });
    }

    return this.toSingleTreeItem(updated);
  }

  async move(
    nodeId: string,
    body: MoveNodeDto,
    ctx: ActorContext,
  ): Promise<NodeTreeItem> {
    const target = await this.prisma.scheduleNode.findUnique({
      where: { id: nodeId },
    });
    if (!target) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
    await this.assertWriteAccess(target.projectId, ctx);

    if (target.updatedAt.toISOString() !== body.expectedUpdatedAt) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Node has been modified by another user',
        currentUpdatedAt: target.updatedAt.toISOString(),
      });
    }
    if (body.newSortOrder < 1) {
      throw new BadRequestException({ error: 'INVALID_SORT_ORDER' });
    }

    // 새 부모 검증 (같은 프로젝트, 자기 자손 아님)
    let newParentDepth = -1;
    if (body.newParentId) {
      if (body.newParentId === nodeId) {
        throw new BadRequestException({ error: 'CYCLE_DETECTED' });
      }
      const newParent = await this.prisma.scheduleNode.findUnique({
        where: { id: body.newParentId },
      });
      if (!newParent || newParent.projectId !== target.projectId) {
        throw new BadRequestException({ error: 'INVALID_PARENT' });
      }
      newParentDepth = newParent.depth;
    }

    // 자손 수집 + 사이클 검사
    const allRows = await this.prisma.scheduleNode.findMany({
      where: { projectId: target.projectId },
      select: { id: true, parentId: true, depth: true, sortOrder: true },
    });
    const childMap = new Map<string | null, typeof allRows>();
    for (const r of allRows) {
      const list = childMap.get(r.parentId) ?? [];
      list.push(r);
      childMap.set(r.parentId, list);
    }
    const subtreeIds = new Set<string>();
    const queue: string[] = [nodeId];
    let maxDescendantDepth = target.depth;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      subtreeIds.add(cur);
      for (const c of childMap.get(cur) ?? []) {
        if (c.depth > maxDescendantDepth) maxDescendantDepth = c.depth;
        queue.push(c.id);
      }
    }
    if (body.newParentId && subtreeIds.has(body.newParentId)) {
      throw new BadRequestException({ error: 'CYCLE_DETECTED' });
    }

    const newDepth = newParentDepth + 1;
    const depthDelta = newDepth - target.depth;
    const newMaxDepth = maxDescendantDepth + depthDelta;
    if (newMaxDepth >= MAX_TREE_DEPTH) {
      throw new BadRequestException({ error: 'MAX_DEPTH_EXCEEDED' });
    }

    const oldParentId = target.parentId;
    const oldSortOrder = target.sortOrder;
    const oldDepth = target.depth;

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1) 원래 자리에서 빠진 효과: 같은 부모의 sortOrder > old 인 형제들 -1.
      //    sameParent 일 때도 항상 실행해야 same-parent forward move 의 gap 을 막음.
      //    (예: [1,2,3,4,5] 에서 self=3 → 5 로 이동 시 step 1 을 건너뛰면 최종 [1,2,_,4,5,6])
      await tx.scheduleNode.updateMany({
        where: {
          projectId: target.projectId,
          parentId: oldParentId,
          sortOrder: { gt: oldSortOrder },
          id: { not: nodeId }, // 안전장치 — 본인은 step 5 에서 갱신
        },
        data: { sortOrder: { decrement: 1 } },
      });

      // 2) 새 부모의 자식 수 계산 → newSortOrder clamp
      const targetSiblingCount = await tx.scheduleNode.count({
        where: {
          projectId: target.projectId,
          parentId: body.newParentId ?? null,
          id: { not: nodeId },
        },
      });
      const insertAt = Math.min(body.newSortOrder, targetSiblingCount + 1);

      // 3) 새 부모의 sortOrder >= insertAt 인 형제들 +1 (이동 노드 제외)
      await tx.scheduleNode.updateMany({
        where: {
          projectId: target.projectId,
          parentId: body.newParentId ?? null,
          sortOrder: { gte: insertAt },
          id: { not: nodeId },
        },
        data: { sortOrder: { increment: 1 } },
      });

      // 4) 자손 depth 일괄 갱신 (이동 노드 제외, 자손만)
      const descendants = Array.from(subtreeIds).filter((id) => id !== nodeId);
      if (depthDelta !== 0 && descendants.length > 0) {
        await tx.scheduleNode.updateMany({
          where: { id: { in: descendants } },
          data: { depth: { increment: depthDelta } },
        });
      }

      // 5) 이동 노드 본체
      const node = await tx.scheduleNode.update({
        where: { id: nodeId },
        data: {
          parentId: body.newParentId ?? null,
          sortOrder: insertAt,
          depth: newDepth,
          updatedById: ctx.actorId,
        },
      });

      await this.writeHistory(tx, {
        nodeId,
        projectId: target.projectId,
        actorId: ctx.actorId,
        action: 'MOVE',
        diff: {
          parentId: { from: oldParentId, to: node.parentId },
          sortOrder: { from: oldSortOrder, to: node.sortOrder },
          depth: { from: oldDepth, to: node.depth },
        },
      });

      return node;
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'NODE_MOVE',
      targetType: 'schedule_node',
      targetId: nodeId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        projectId: target.projectId,
        from: { parentId: oldParentId, sortOrder: oldSortOrder, depth: oldDepth },
        to: { parentId: updated.parentId, sortOrder: updated.sortOrder, depth: updated.depth },
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'schedule_node',
        targetId: nodeId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'NODE_MOVE' },
      });
    }

    return this.toSingleTreeItem(updated);
  }

  /**
   * Hard delete. 자손도 cascade. NodeHistory 는 onDelete=SetNull 로 보존됨.
   * 자손 각각에 대해서도 DELETE history 기록.
   */
  async hardDelete(nodeId: string, ctx: ActorContext): Promise<void> {
    const target = await this.prisma.scheduleNode.findUnique({
      where: { id: nodeId },
    });
    if (!target) throw new NotFoundException({ error: 'NODE_NOT_FOUND' });
    await this.assertWriteAccess(target.projectId, ctx);

    const allRows = await this.prisma.scheduleNode.findMany({
      where: { projectId: target.projectId },
    });
    const byId = new Map(allRows.map((r) => [r.id, r]));
    const subtree: ScheduleNode[] = [];
    const queue: string[] = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const node = byId.get(cur);
      if (!node) continue;
      subtree.push(node);
      for (const r of allRows) {
        if (r.parentId === cur) queue.push(r.id);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const n of subtree) {
        await this.writeHistory(tx, {
          nodeId: n.id,
          projectId: n.projectId,
          actorId: ctx.actorId,
          action: 'DELETE',
          diff: {
            kind: { from: n.kind, to: null },
            title: { from: n.title, to: null },
            description: { from: n.description, to: null },
            parentId: { from: n.parentId, to: null },
            sortOrder: { from: n.sortOrder, to: null },
            depth: { from: n.depth, to: null },
            startAt: { from: n.startAt, to: null },
            endAt: { from: n.endAt, to: null },
            progress: { from: n.progress, to: null },
          },
        });
      }
      // 같은 부모의 후속 형제 sortOrder 당김
      await tx.scheduleNode.updateMany({
        where: {
          projectId: target.projectId,
          parentId: target.parentId,
          sortOrder: { gt: target.sortOrder },
        },
        data: { sortOrder: { decrement: 1 } },
      });
      // ScheduleNode.parent FK 의 onDelete 가 SetNull 이라 자식이 루트로 떠오를 수 있음.
      // 정책은 "cascade 삭제" — 명시적으로 자손부터 leaf-first 로 직접 삭제.
      const ordered = [...subtree].sort((a, b) => b.depth - a.depth);
      for (const n of ordered) {
        await tx.scheduleNode.delete({ where: { id: n.id } });
      }
    });

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'NODE_DELETE',
      targetType: 'schedule_node',
      targetId: nodeId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        projectId: target.projectId,
        title: target.title,
        descendantCount: subtree.length - 1,
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'schedule_node',
        targetId: nodeId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'NODE_DELETE' },
      });
    }
  }

  // ─── 내부 유틸 ────────────────────────────────────────────────────────────

  private async assertProjectExists(projectId: string): Promise<void> {
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
  }

  /** 멤버 OR ADMIN+adminMode */
  private async assertReadAccess(
    projectId: string,
    ctx: ActorContext,
  ): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
  }

  /** DESIGN §4.2: 노드 CRUD 는 MANAGER/MEMBER 모두 허용. ADMIN+adminMode 도 허용. */
  private async assertWriteAccess(
    projectId: string,
    ctx: ActorContext,
  ): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
  }

  private async writeHistory(
    tx: Prisma.TransactionClient,
    args: {
      nodeId: string;
      projectId: string;
      actorId: string;
      action: NodeAction;
      diff: Record<string, { from: unknown; to: unknown }>;
    },
  ): Promise<void> {
    await tx.nodeHistory.create({
      data: {
        id: randomUUID(),
        nodeId: args.nodeId,
        nodeIdSnapshot: args.nodeId,
        projectIdSnapshot: args.projectId,
        actorId: args.actorId,
        action: args.action,
        diffJson: JSON.stringify(args.diff),
      },
    });
  }

  private toSingleTreeItem(node: ScheduleNode): NodeTreeItem {
    // 단일 노드 응답에서는 effective = 본인 값 (자식 정보 없음 — GROUP 의 progressEffective 는 null)
    const isItem = node.kind === 'ITEM';
    return {
      id: node.id,
      projectId: node.projectId,
      parentId: node.parentId,
      kind: isItem ? 'ITEM' : 'GROUP',
      title: node.title,
      description: node.description,
      startAt: isItem ? node.startAt : null,
      endAt: isItem ? node.endAt : null,
      startAtEffective: isItem ? node.startAt : null,
      endAtEffective: isItem ? node.endAt : null,
      progress: node.progress,
      progressEffective: isItem ? node.progress : null,
      sortOrder: node.sortOrder,
      depth: node.depth,
      createdById: node.createdById,
      updatedById: node.updatedById,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }
}
