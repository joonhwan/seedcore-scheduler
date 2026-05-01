import type { NodeKind, NodeTreeItem } from '@sam/shared';

/**
 * DESIGN §3.4 — GROUP 의 *_effective 자동 집계.
 *  - ITEM: effective = 본인 startAt/endAt/progress 그대로
 *  - GROUP: 자손(ITEM 의 startAt/endAt + 자손 GROUP 의 effective) 의 min/max
 *  - 자손이 모두 null 이면 effective 도 null
 *
 * progress 는 자손 ITEM 만의 단순평균(반올림). 자손 ITEM 0개면 null.
 *  - GROUP only-children 은 그 자식 GROUP 의 effective 를 통해 자연스럽게 평탄화됨
 *  - DESIGN §3.4 의 옵션 1 (읽기 시 재귀 계산) 그대로 — 캐시 컬럼 미도입
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
  progress: number;
  sortOrder: number;
  depth: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Effective {
  start: string | null;
  end: string | null;
  // progress 집계는 자손 ITEM 의 합/개수로 캐리. GROUP 의 effective 를 합산하면
  // GROUP 안의 ITEM 들이 이중 가중되므로 sum/count 패턴을 그대로 위로 전달.
  sum: number;
  count: number;
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

  const effective = new Map<string, Effective>();

  function visit(node: RawNode): Effective {
    const kids = childrenByParent.get(node.id) ?? [];
    if (node.kind === 'ITEM') {
      const eff: Effective = {
        start: node.startAt,
        end: node.endAt,
        sum: node.progress,
        count: 1,
      };
      effective.set(node.id, eff);
      return eff;
    }
    // GROUP
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    let sum = 0;
    let count = 0;
    for (const child of kids) {
      const e = visit(child);
      if (e.start !== null && (minStart === null || e.start < minStart)) {
        minStart = e.start;
      }
      if (e.end !== null && (maxEnd === null || e.end > maxEnd)) {
        maxEnd = e.end;
      }
      sum += e.sum;
      count += e.count;
    }
    const eff: Effective = { start: minStart, end: maxEnd, sum, count };
    effective.set(node.id, eff);
    return eff;
  }

  for (const root of childrenByParent.get(null) ?? []) {
    visit(root);
  }

  return rows.map((r) => {
    const eff = effective.get(r.id);
    const start = eff?.start ?? null;
    const end = eff?.end ?? null;
    const progressEffective: number | null =
      r.kind === 'ITEM'
        ? r.progress
        : eff && eff.count > 0
          ? Math.round(eff.sum / eff.count)
          : null;
    return {
      id: r.id,
      projectId: r.projectId,
      parentId: r.parentId,
      kind: r.kind as NodeKind,
      title: r.title,
      description: r.description,
      startAt: r.kind === 'ITEM' ? r.startAt : null,
      endAt: r.kind === 'ITEM' ? r.endAt : null,
      startAtEffective: start,
      endAtEffective: end,
      progress: r.progress,
      progressEffective,
      sortOrder: r.sortOrder,
      depth: r.depth,
      createdById: r.createdById,
      updatedById: r.updatedById,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
