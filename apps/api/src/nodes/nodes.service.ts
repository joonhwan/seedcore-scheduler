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
  ImportCsvDto,
  type CreateNodeDto,
  type MoveNodeDto,
  type NodeAction,
  type NodeTreeItem,
  type UpdateNodeDto,
} from '@sam/shared';
import { Prisma, type ScheduleNode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutocompleteService } from '../autocomplete/autocomplete.service';
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
    private readonly autocomplete: AutocompleteService,
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

    await this.autocomplete.collect(created.title, created.kind as 'GROUP' | 'ITEM');

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

    if (body.title !== undefined && body.title !== target.title) {
      await this.autocomplete.collect(updated.title, updated.kind as 'GROUP' | 'ITEM');
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

  async importCsv(
    projectId: string,
    body: ImportCsvDto,
    ctx: ActorContext,
  ): Promise<NodeTreeItem[]> {
    await this.assertProjectExists(projectId);
    await this.assertWriteAccess(projectId, ctx);

    const csvText = body.csvText;
    const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException({ error: 'EMPTY_CSV', message: 'CSV 데이터가 비어 있습니다.' });
    }

    // 1. CSV 라인 파싱 및 열 분할
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result.map(val => {
        let clean = val;
        if (clean.startsWith('"') && clean.endsWith('"')) {
          clean = clean.slice(1, -1);
        }
        return clean.replace(/""/g, '"').trim();
      });
    };

    const parsedLines = lines.map(line => parseCsvLine(line));

    // 2. 유동적 컬럼 분석 (날짜 열 찾기)
    let startDateColIdx = 5;
    let endDateColIdx = 6;
    let progressColIdx = 7;

    const datePattern = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/;
    const colMatchCounts: Record<number, number> = {};

    // 각 열 별로 날짜 패턴에 맞는 데이터 수 카운트
    parsedLines.forEach(cols => {
      cols.forEach((col, idx) => {
        if (datePattern.test(col)) {
          colMatchCounts[idx] = (colMatchCounts[idx] || 0) + 1;
        }
      });
    });

    const colIndices = Object.keys(colMatchCounts)
      .map(Number)
      .sort((a, b) => (colMatchCounts[b] || 0) - (colMatchCounts[a] || 0));

    if (colIndices.length >= 2) {
      const first = colIndices[0];
      const second = colIndices[1];
      if (first !== undefined && second !== undefined) {
        const detected = [first, second].sort((a, b) => a - b);
        startDateColIdx = detected[0] ?? 5;
        endDateColIdx = detected[1] ?? 6;
        progressColIdx = endDateColIdx + 1;
      }
    }

    // 트리 깊이 컬럼 수 (최소 1개, 최대 5개 제한)
    const maxDepth = Math.max(1, Math.min(5, startDateColIdx));

    // 3. 임시 노드 생성 및 보정 규칙 적용
    interface TmpNode {
      tempId: string;
      title: string;
      depth: number;
      rawStartAt: string;
      rawEndAt: string;
      rawProgress: string;
      kind: 'GROUP' | 'ITEM';
      parentId: string | null;
      sortOrder: number;
    }

    const tmpNodes: TmpNode[] = [];
    let isFirstNode = true;
    let lastAssignedDepth = -1;

    for (let rowIndex = 0; rowIndex < parsedLines.length; rowIndex++) {
      const cols = parsedLines[rowIndex];
      if (!cols) continue;

      // 트리 깊이 컬럼 중 최초로 텍스트가 발견되는 컬럼 탐색
      let foundDepth = -1;
      let foundTitle = '';

      for (let d = 0; d < maxDepth; d++) {
        const cell = cols[d];
        if (cell && cell.trim().length > 0) {
          foundDepth = d;
          foundTitle = cell.trim();
          break;
        }
      }

      // 만약 트리 이름이 전혀 기재되지 않은 행이라면 무시(Skip)
      if (foundDepth === -1 || !foundTitle) {
        continue;
      }

      // 보정 1: 첫 번째 행의 깊이가 0이 아닐 때 강제 0으로 지정
      if (isFirstNode) {
        foundDepth = 0;
        isFirstNode = false;
      }

      // 보정 2: 깊이가 2단계 이상 도약할 때 보정 (한 단계 아래로만 내려가도록 함)
      if (foundDepth > lastAssignedDepth + 1) {
        foundDepth = lastAssignedDepth + 1;
      }

      lastAssignedDepth = foundDepth;

      const rawStartAt = (startDateColIdx < cols.length ? cols[startDateColIdx] : '') || '';
      const rawEndAt = (endDateColIdx < cols.length ? cols[endDateColIdx] : '') || '';
      const rawProgress = (progressColIdx < cols.length ? cols[progressColIdx] : '') || '';

      tmpNodes.push({
        tempId: `temp-${rowIndex}-${randomUUID().slice(0, 8)}`,
        title: foundTitle,
        depth: foundDepth,
        rawStartAt,
        rawEndAt,
        rawProgress,
        kind: 'ITEM', // 후속 판정
        parentId: null,
        sortOrder: 1,
      });
    }

    if (tmpNodes.length === 0) {
      throw new BadRequestException({ error: 'NO_VALID_NODES', message: '가져올 수 있는 유효한 일정 노드가 없습니다.' });
    }

    // 4. 부모 자식 관계 수립 및 GROUP/ITEM 성격 판정
    for (let i = 0; i < tmpNodes.length; i++) {
      const current = tmpNodes[i];
      if (!current) continue;
      if (current.depth > 0) {
        // 자기 위로 거슬러 올라가며 Depth = current.depth - 1 인 최초의 노드를 찾음
        let foundParent = false;
        for (let j = i - 1; j >= 0; j--) {
          const possibleParent = tmpNodes[j];
          if (possibleParent && possibleParent.depth === current.depth - 1) {
            current.parentId = possibleParent.tempId;
            foundParent = true;
            break;
          }
        }
        // 혹시라도 매칭 부모를 못 찾았다면 (비정상 케이스) 최상위 루트로 강제 보정
        if (!foundParent) {
          current.depth = 0;
        }
      }
    }

    // 자식 보유 여부를 파악해서 GROUP / ITEM 결정
    for (let i = 0; i < tmpNodes.length; i++) {
      const current = tmpNodes[i];
      if (!current) continue;
      const hasChildren = tmpNodes.some(n => n && n.parentId === current.tempId);
      current.kind = hasChildren ? 'GROUP' : 'ITEM';
    }

    // 5. ITEM 노드 필드 보정 (날짜/진척율 정규화)
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const parseDateStr = (dateStr: string): string => {
      if (!dateStr) return '';
      // 구분자 통일
      const clean = dateStr.replace(/[/.]/g, '-').trim();
      const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        const y = match[1]!;
        const m = match[2]!.padStart(2, '0');
        const d = match[3]!.padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return '';
    };

    const parseProgressVal = (progStr: string): number => {
      if (!progStr) return 0;
      const match = progStr.match(/\d+/);
      if (match && match[0]) {
        const val = parseInt(match[0], 10);
        return Math.min(100, Math.max(0, val));
      }
      return 0;
    };

    tmpNodes.forEach(node => {
      if (!node) return;
      if (node.kind === 'GROUP') {
        node.rawStartAt = '';
        node.rawEndAt = '';
        node.rawProgress = '0';
      } else {
        let start = parseDateStr(node.rawStartAt);
        let end = parseDateStr(node.rawEndAt);

        if (!start && !end) {
          start = todayStr;
          end = todayStr;
        } else if (!start) {
          start = end;
        } else if (!end) {
          end = start;
        }

        // 역전 방지
        if (start > end) {
          end = start;
        }

        node.rawStartAt = start;
        node.rawEndAt = end;
        node.rawProgress = String(parseProgressVal(node.rawProgress));
      }
    });

    // 6. DB 반영 (한 트랜잭션 내에서 처리)
    const tempToRealIdMap: Record<string, string> = {};
    const now = new Date();

    const createdRows = await this.prisma.$transaction(async (tx) => {
      // 기존 노드들 일괄 삭제
      await tx.scheduleNode.deleteMany({ where: { projectId } });

      // 부모별 sortOrder를 독립적으로 세기 위한 카운터 맵
      const sortOrderCounters: Record<string, number> = {};

      const nodesToInsert: ScheduleNode[] = [];

      for (const tNode of tmpNodes) {
        if (!tNode) continue;
        const realId = randomUUID();
        tempToRealIdMap[tNode.tempId] = realId;

        const parentKey = tNode.parentId ? tempToRealIdMap[tNode.parentId] : 'ROOT';
        if (!parentKey) continue;
        const currentSort = (sortOrderCounters[parentKey] || 0) + 1;
        sortOrderCounters[parentKey] = currentSort;

        const realParentId = tNode.parentId ? (tempToRealIdMap[tNode.parentId] || null) : null;

        const startAt = tNode.kind === 'GROUP' ? null : tNode.rawStartAt;
        const endAt = tNode.kind === 'GROUP' ? null : tNode.rawEndAt;
        const progress = tNode.kind === 'GROUP' ? 0 : parseInt(tNode.rawProgress, 10);

        const node = await tx.scheduleNode.create({
          data: {
            id: realId,
            projectId,
            parentId: realParentId,
            kind: tNode.kind,
            title: tNode.title,
            description: null,
            startAt,
            endAt,
            progress,
            sortOrder: currentSort,
            depth: tNode.depth,
            createdById: ctx.actorId,
            updatedById: ctx.actorId,
            createdAt: now,
            updatedAt: now,
          },
        });

        nodesToInsert.push(node);
      }

      // 히스토리 일괄 기록 (프로젝트 단위 벌크 생성)
      await tx.nodeHistory.create({
        data: {
          id: randomUUID(),
          nodeId: null,
          nodeIdSnapshot: projectId,
          projectIdSnapshot: projectId,
          actorId: ctx.actorId,
          action: 'CREATE',
          diffJson: JSON.stringify({
            bulk_import: { from: null, to: `Imported ${nodesToInsert.length} nodes from CSV` },
          }),
        },
      });

      return nodesToInsert;
    });

    // 프로젝트 업데이트 이력 추가
    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_IMPORT_CSV',
      targetType: 'project',
      targetId: projectId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: { count: createdRows.length },
    });

    // 전체 리스트 반환
    return buildTreeItems(createdRows);
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
