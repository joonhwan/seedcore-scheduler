import type { NodeTreeItem } from '@sam/shared';

export type CheckState = 'checked' | 'indeterminate' | 'unchecked';

function buildChildrenMap(items: NodeTreeItem[]): Map<string | null, NodeTreeItem[]> {
  const map = new Map<string | null, NodeTreeItem[]>();
  for (const n of items) {
    const arr = map.get(n.parentId) ?? [];
    arr.push(n);
    map.set(n.parentId, arr);
  }
  return map;
}

// 노드 자신과 모든 자손의 id (그룹 선택 시 토글 대상 수집용)
export function collectSubtreeIds(rootId: string, items: NodeTreeItem[]): string[] {
  const childrenMap = buildChildrenMap(items);
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const child of childrenMap.get(id) ?? []) walk(child.id);
  };
  walk(rootId);
  return out;
}

// 각 노드의 체크 상태.
// - ITEM: 선택되면 checked, 아니면 unchecked.
// - GROUP: 자신이 선택되면 checked. 자신은 미선택이지만 자손 중 선택된 것이 있으면 indeterminate(half).
//   (자식이 전부 개별 선택돼도 그룹 자신이 선택된 게 아니면 indeterminate 로 둔다)
export function computeCheckStates(
  items: NodeTreeItem[],
  selection: Set<string>,
): Map<string, CheckState> {
  const childrenMap = buildChildrenMap(items);
  const result = new Map<string, CheckState>();

  function visit(node: NodeTreeItem): CheckState {
    if (node.kind === 'ITEM') {
      const s: CheckState = selection.has(node.id) ? 'checked' : 'unchecked';
      result.set(node.id, s);
      return s;
    }
    // GROUP: 자손 상태를 먼저 계산(result 채우기)
    let anyDescendantSelected = false;
    for (const child of childrenMap.get(node.id) ?? []) {
      const cs = visit(child);
      if (cs === 'checked' || cs === 'indeterminate') anyDescendantSelected = true;
    }
    let s: CheckState;
    if (selection.has(node.id)) s = 'checked';
    else if (anyDescendantSelected) s = 'indeterminate';
    else s = 'unchecked';
    result.set(node.id, s);
    return s;
  }

  for (const root of childrenMap.get(null) ?? []) visit(root);
  return result;
}

// 삭제 대상: 선택 노드 중 조상이 함께 선택된 것은 제외한다(부모 삭제 시 자식은 cascade).
// 남은 "최상위 선택 노드"만 반환한다.
export function collectDeleteTargets(
  selectedIds: Set<string>,
  items: NodeTreeItem[],
): string[] {
  const byId = new Map(items.map((n) => [n.id, n]));
  const out: string[] = [];
  for (const id of selectedIds) {
    let parent = byId.get(id)?.parentId ?? null;
    let ancestorSelected = false;
    while (parent) {
      if (selectedIds.has(parent)) {
        ancestorSelected = true;
        break;
      }
      parent = byId.get(parent)?.parentId ?? null;
    }
    if (!ancestorSelected) out.push(id);
  }
  return out;
}

// 100% 완료 대상 ITEM id 목록.
// - 'items-only': 선택된 ITEM 만(GROUP 무시)
// - 'include-descendants': 선택된 GROUP 의 모든 자손 ITEM + 선택된 ITEM (합집합, 중복 제거)
export function collectCompleteTargets(
  selectedIds: Set<string>,
  items: NodeTreeItem[],
  mode: 'items-only' | 'include-descendants',
): string[] {
  const byId = new Map(items.map((n) => [n.id, n]));
  const childrenMap = new Map<string | null, NodeTreeItem[]>();
  for (const n of items) {
    const arr = childrenMap.get(n.parentId) ?? [];
    arr.push(n);
    childrenMap.set(n.parentId, arr);
  }

  const result = new Set<string>();
  const addDescendantItems = (nodeId: string) => {
    for (const child of childrenMap.get(nodeId) ?? []) {
      if (child.kind === 'ITEM') result.add(child.id);
      else addDescendantItems(child.id);
    }
  };

  for (const id of selectedIds) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.kind === 'ITEM') {
      result.add(n.id);
    } else if (mode === 'include-descendants') {
      addDescendantItems(n.id);
    }
    // items-only 모드에서 GROUP 은 무시
  }
  return [...result];
}

// 선택 항목 중 GROUP 이 하나라도 있는지(100% 완료 시 대화상자 분기용)
export function hasGroupSelected(
  selectedIds: Set<string>,
  items: NodeTreeItem[],
): boolean {
  const byId = new Map(items.map((n) => [n.id, n]));
  for (const id of selectedIds) {
    if (byId.get(id)?.kind === 'GROUP') return true;
  }
  return false;
}
