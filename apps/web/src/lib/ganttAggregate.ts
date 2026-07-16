import type { NodeTreeItem } from '@sam/shared';
import type { AffectedGroupChange } from './ganttTypes';

// 백엔드 tree-aggregation.ts 의 MIN/MAX 규칙을 프론트에서 재현한다.
// startAtEffective/endAtEffective 만 다시 계산하고 나머지 필드(progressEffective 등)는 보존한다.
// parentId === null 을 루트로 보고 자식맵을 만들어 재귀 집계한다.
export function recomputeEffective(items: NodeTreeItem[]): NodeTreeItem[] {
  const childrenMap = new Map<string | null, NodeTreeItem[]>();
  for (const n of items) {
    const arr = childrenMap.get(n.parentId) ?? [];
    arr.push(n);
    childrenMap.set(n.parentId, arr);
  }

  const startEff = new Map<string, string | null>();
  const endEff = new Map<string, string | null>();

  function visit(node: NodeTreeItem): { start: string | null; end: string | null } {
    if (node.kind === 'ITEM') {
      startEff.set(node.id, node.startAt);
      endEff.set(node.id, node.endAt);
      return { start: node.startAt, end: node.endAt };
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const child of childrenMap.get(node.id) ?? []) {
      const r = visit(child);
      if (r.start && (minStart === null || r.start < minStart)) minStart = r.start;
      if (r.end && (maxEnd === null || r.end > maxEnd)) maxEnd = r.end;
    }
    startEff.set(node.id, minStart);
    endEff.set(node.id, maxEnd);
    return { start: minStart, end: maxEnd };
  }

  for (const root of childrenMap.get(null) ?? []) visit(root);

  return items.map((n) => ({
    ...n,
    startAtEffective: startEff.get(n.id) ?? null,
    endAtEffective: endEff.get(n.id) ?? null,
  }));
}

// before/after 두 배열에서 effective 범위가 달라진 GROUP만 골라 반환한다.
// depth 내림차순(가까운 부모 먼저)으로 정렬한다.
export function diffAffectedGroups(
  before: NodeTreeItem[],
  after: NodeTreeItem[],
): AffectedGroupChange[] {
  const beforeMap = new Map(before.map((n) => [n.id, n]));
  const out: AffectedGroupChange[] = [];
  for (const a of after) {
    if (a.kind !== 'GROUP') continue;
    const b = beforeMap.get(a.id);
    if (!b) continue;
    if (b.startAtEffective !== a.startAtEffective || b.endAtEffective !== a.endAtEffective) {
      out.push({
        id: a.id,
        title: a.title,
        depth: a.depth,
        beforeStart: b.startAtEffective,
        beforeEnd: b.endAtEffective,
        afterStart: a.startAtEffective,
        afterEnd: a.endAtEffective,
      });
    }
  }
  out.sort((x, y) => y.depth - x.depth);
  return out;
}
