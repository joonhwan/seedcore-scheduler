import type { NodeKind, NodeTreeItem } from '@sam/shared';

/**
 * DESIGN §3.4 — GROUP 의 start_at_effective / end_at_effective 자동 집계.
 *  - ITEM: effective = 본인 startAt/endAt 그대로
 *  - GROUP: 자손(ITEM 의 startAt/endAt + 자손 GROUP 의 effective) 의 min/max
 *  - 자손이 모두 null 이면 effective 도 null
 *
 * 입력은 같은 프로젝트의 노드 평면 배열. parentId 로 트리를 구성한 뒤
 * post-order DFS 로 한 번에 채운다.
 */

interface RawNode {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: 'GROUP' | 'ITEM' | string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  depth: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export function buildTreeItems(rows: RawNode[]): NodeTreeItem[] {
  const childrenByParent = new Map<string | null, RawNode[]>();
  for (const r of rows) {
    const list = childrenByParent.get(r.parentId) ?? [];
    list.push(r);
    childrenByParent.set(r.parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const effective = new Map<string, { start: string | null; end: string | null }>();

  function visit(node: RawNode): { start: string | null; end: string | null } {
    const kids = childrenByParent.get(node.id) ?? [];
    if (node.kind === 'ITEM' || kids.length === 0) {
      const eff = {
        start: node.kind === 'ITEM' ? node.startAt : null,
        end: node.kind === 'ITEM' ? node.endAt : null,
      };
      effective.set(node.id, eff);
      return eff;
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const child of kids) {
      const e = visit(child);
      if (e.start !== null && (minStart === null || e.start < minStart)) {
        minStart = e.start;
      }
      if (e.end !== null && (maxEnd === null || e.end > maxEnd)) {
        maxEnd = e.end;
      }
    }
    const eff = { start: minStart, end: maxEnd };
    effective.set(node.id, eff);
    return eff;
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root);
  }

  return rows.map((r) => {
    const eff = effective.get(r.id) ?? { start: null, end: null };
    return {
      id: r.id,
      projectId: r.projectId,
      parentId: r.parentId,
      kind: r.kind as NodeKind,
      title: r.title,
      description: r.description,
      startAt: r.kind === 'ITEM' ? r.startAt : null,
      endAt: r.kind === 'ITEM' ? r.endAt : null,
      startAtEffective: eff.start,
      endAtEffective: eff.end,
      sortOrder: r.sortOrder,
      depth: r.depth,
      createdById: r.createdById,
      updatedById: r.updatedById,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
