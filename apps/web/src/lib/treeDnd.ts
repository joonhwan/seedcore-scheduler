// 트리 드래그 앤 드롭의 드롭 대상 계산.
// 드롭 대상은 (행 경계 boundary, 깊이 depth) 한 쌍이다.
// 세로 위치가 어느 두 행 사이인지를, 가로 위치가 들여쓰기 깊이(= 부모)를 정한다.
// DOM 에 의존하지 않는다 — 좌표 보정은 호출부(Timeline.tsx)가 끝내서 넘긴다.
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';
import type { TreeNode } from '../components/NodeTree';
import { ROW_HEIGHT } from './ganttLayout';

/** 트리 한 단계당 들여쓰기 픽셀. 라벨 칸의 paddingLeft 계산과 같은 값이어야 한다. */
export const INDENT_PX = 16;
/** 깊이 0 의 왼쪽 여백. 라벨 칸의 paddingLeft 계산과 같은 값이어야 한다. */
export const LABEL_BASE_PX = 8;

/**
 * 경계 `boundary` 에서 고를 수 있는 깊이의 범위.
 * - 상한: 위 행이 GROUP 이면 그 자식이 될 수 있으므로 +1
 * - 하한: 아래 행의 깊이. 아래 행이 없으면(트리 끝) 최상위까지 뺄 수 있다.
 */
export function depthRangeAt(
  rows: TreeNode[],
  boundary: number,
): { minDepth: number; maxDepth: number } {
  const above = boundary > 0 ? rows[boundary - 1] : undefined;
  const below = rows[boundary];

  if (!above) return { minDepth: 0, maxDepth: 0 };

  const maxDepth = above.kind === 'GROUP' ? above.depth + 1 : above.depth;
  const minDepth = below ? below.depth : 0;
  // below 가 above 보다 깊을 수는 없지만(평탄화 순서상), 방어적으로 뒤집힌 범위를 막는다.
  return { minDepth: Math.min(minDepth, maxDepth), maxDepth };
}

/** 가로 좌표(라벨 칸 왼쪽 끝 기준)를 깊이로 읽고 허용 범위로 clamp 한다. */
export function depthFromX(rows: TreeNode[], boundary: number, x: number): number {
  const { minDepth, maxDepth } = depthRangeAt(rows, boundary);
  const raw = Math.round((x - LABEL_BASE_PX) / INDENT_PX);
  return Math.max(minDepth, Math.min(maxDepth, raw));
}

/** parentId → 자식 목록 맵. O(n)으로 한 번만 만들어 재사용한다. */
function buildChildrenMap(items: NodeTreeItem[]): Map<string | null, NodeTreeItem[]> {
  const map = new Map<string | null, NodeTreeItem[]>();
  for (const it of items) {
    const key = it.parentId;
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return map;
}

/** 자기 자신을 포함한 자손 id 집합. `items` 전체를 매번 스캔하지 않도록 parentId→children 맵을 한 번만 만들어 순회한다. */
export function descendantIdsOf(items: NodeTreeItem[], nodeId: string): Set<string> {
  const childrenMap = buildChildrenMap(items);
  const out = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const children = childrenMap.get(cur);
    if (!children) continue;
    for (const it of children) {
      if (!out.has(it.id)) {
        out.add(it.id);
        stack.push(it.id);
      }
    }
  }
  return out;
}

/**
 * 서브트리가 자기 아래로 몇 단계까지 뻗는지. 자손이 없으면 0.
 * `precomputedDescendantIds` 를 주면 다시 계산하지 않고 그대로 쓴다
 * (canDropInto 가 이미 계산해둔 집합을 넘겨 이중 순회를 피할 때 쓴다).
 */
export function subtreeRelativeDepth(
  items: NodeTreeItem[],
  nodeId: string,
  precomputedDescendantIds?: Set<string>,
): number {
  const ids = precomputedDescendantIds ?? descendantIdsOf(items, nodeId);
  const self = items.find((n) => n.id === nodeId);
  if (!self) return 0;
  let max = self.depth;
  for (const it of items) {
    if (ids.has(it.id) && it.depth > max) max = it.depth;
  }
  return max - self.depth;
}

/**
 * `node` 를 `parentId` 아래로 옮길 수 있는지.
 * 거절 사유 문구는 커서 배지와 부모 선택 다이얼로그가 그대로 쓴다.
 */
export function canDropInto(
  items: NodeTreeItem[],
  node: NodeTreeItem,
  parentId: string | null,
): { ok: boolean; reason?: string } {
  let parentDepth = -1;
  // 자손 집합은 한 번만 계산해서 자기-하위 검사와 subtreeRelativeDepth 둘 다에 재사용한다.
  const descendantIds = descendantIdsOf(items, node.id);

  if (parentId !== null) {
    const parent = items.find((n) => n.id === parentId);
    if (!parent) return { ok: false, reason: '대상 그룹을 찾을 수 없습니다' };
    if (descendantIds.has(parentId)) {
      return { ok: false, reason: '자기 하위로는 옮길 수 없습니다' };
    }
    if (parent.kind !== 'GROUP') {
      return { ok: false, reason: '일반 항목에는 넣을 수 없습니다' };
    }
    parentDepth = parent.depth;
  }

  const newDepth = parentDepth + 1;
  if (newDepth + subtreeRelativeDepth(items, node.id, descendantIds) >= MAX_TREE_DEPTH) {
    return { ok: false, reason: `최대 깊이 ${MAX_TREE_DEPTH}단계를 넘습니다` };
  }
  return { ok: true };
}

export interface DropTarget {
  /** 삽입선을 그릴 행 경계 (0 .. rows.length) */
  boundary: number;
  /** 삽입선 들여쓰기 = LABEL_BASE_PX + depth * INDENT_PX */
  depth: number;
  parentId: string | null;
  /** 자기 자신을 뺀 형제 배열에서의 0-based 삽입 위치 */
  insertIndex: number;
  ok: boolean;
  reason?: string;
}

/** 같은 부모를 가진 형제를 sortOrder 순으로, 드래그 중인 노드만 빼고 돌려준다. */
export function siblingsExcluding(
  items: NodeTreeItem[],
  parentId: string | null,
  excludeId: string,
): NodeTreeItem[] {
  return items
    .filter((n) => n.parentId === parentId && n.id !== excludeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** (경계, 깊이) 를 실제 부모와 삽입 위치로 바꾸고 이동 가능한지 판정한다. */
export function resolveTarget(
  rows: TreeNode[],
  items: NodeTreeItem[],
  node: NodeTreeItem,
  boundary: number,
  depth: number,
): DropTarget {
  const above = boundary > 0 ? rows[boundary - 1] : undefined;

  let parentId: string | null;
  let anchor: NodeTreeItem | undefined; // 이 노드 "뒤"에 끼운다. 없으면 맨 앞.

  if (!above) {
    parentId = null;
  } else if (depth === above.depth + 1) {
    // 위 행의 첫 자식이 된다.
    parentId = above.id;
  } else {
    // 위 행에서 부모를 타고 올라가 목표 깊이의 조상을 찾는다.
    let cur: NodeTreeItem | undefined = items.find((n) => n.id === above.id);
    while (cur && cur.depth > depth) {
      cur = cur.parentId ? items.find((n) => n.id === cur!.parentId) : undefined;
    }
    anchor = cur;
    parentId = anchor ? anchor.parentId : null;
  }

  const siblings = siblingsExcluding(items, parentId, node.id);
  let insertIndex: number;
  if (!anchor) {
    insertIndex = 0;
  } else if (anchor.id === node.id) {
    // 조상이 드래그 중인 노드 자신이면 위 배열에 없다. 지금 자리를 그대로 쓴다.
    insertIndex = siblings.filter((s) => s.sortOrder < node.sortOrder).length;
  } else {
    insertIndex = siblings.findIndex((s) => s.id === anchor!.id) + 1;
  }

  const verdict = canDropInto(items, node, parentId);
  const target: DropTarget = {
    boundary,
    depth,
    parentId,
    insertIndex,
    ok: verdict.ok,
  };
  if (verdict.reason !== undefined) target.reason = verdict.reason;
  return target;
}

/** 서버가 받는 1-based 삽입 위치. */
export function sortOrderForTarget(target: DropTarget): number {
  return target.insertIndex + 1;
}

/** 이 드롭이 부모까지 바꾸는지 (표시 색 sky/amber 를 가른다). */
export function changesParent(node: NodeTreeItem, target: DropTarget): boolean {
  return target.parentId !== node.parentId;
}

/**
 * 포인터 좌표를 드롭 대상으로 바꾼다.
 * - `y`: 행 컨테이너 상단 기준 (첫 행 위쪽이 0)
 * - `x`: 라벨 칸 왼쪽 끝 기준
 * 둘 다 스크롤 보정이 끝난 값이어야 한다.
 *
 * 제자리면 null 을 돌려준다. 무효(ok:false)와 달리 알릴 사유가 없어
 * 선도 배지도 그리지 않기 때문이다.
 */
export function targetFromPointer(
  rows: TreeNode[],
  items: NodeTreeItem[],
  node: NodeTreeItem,
  x: number,
  y: number,
): DropTarget | null {
  const rowIndex = Math.floor(y / ROW_HEIGHT);
  const withinRow = y - rowIndex * ROW_HEIGHT;
  const rawBoundary = withinRow < ROW_HEIGHT / 2 ? rowIndex : rowIndex + 1;
  const boundary = Math.max(0, Math.min(rows.length, rawBoundary));

  const depth = depthFromX(rows, boundary, x);
  const target = resolveTarget(rows, items, node, boundary, depth);

  // 제자리 판정: 부모가 그대로이고 삽입 위치가 지금 자리와 같다.
  if (target.parentId === node.parentId) {
    const current = siblingsExcluding(items, node.parentId, node.id).filter(
      (s) => s.sortOrder < node.sortOrder,
    ).length;
    if (target.insertIndex === current) return null;
  }
  return target;
}

/** 커서 배지에 띄울 문구와 톤. */
export function describeDropTarget(
  items: NodeTreeItem[],
  node: NodeTreeItem,
  target: DropTarget,
): { text: string; tone: 'sky' | 'amber' | 'rose' } {
  if (!target.ok) {
    return { text: target.reason ?? '여기로는 옮길 수 없습니다', tone: 'rose' };
  }
  const nth = sortOrderForTarget(target);
  if (!changesParent(node, target)) {
    return { text: `${nth}번째로 이동`, tone: 'sky' };
  }
  if (target.parentId === null) {
    return { text: `최상위 ${nth}번째로 이동`, tone: 'amber' };
  }
  const parent = items.find((n) => n.id === target.parentId);
  return { text: `"${parent?.title ?? '?'}" 안 ${nth}번째로 이동`, tone: 'amber' };
}

/** 어떤 부모의 맨 뒤에 붙일 때 쓸 1-based sortOrder. */
export function appendSortOrder(
  items: NodeTreeItem[],
  parentId: string | null,
  excludeId: string,
): number {
  return siblingsExcluding(items, parentId, excludeId).length + 1;
}
