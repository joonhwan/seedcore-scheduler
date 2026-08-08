// 트리 드래그 앤 드롭의 드롭 대상 계산.
// 드롭 대상은 (행 경계 boundary, 깊이 depth) 한 쌍이다.
// 세로 위치가 어느 두 행 사이인지를, 가로 위치가 들여쓰기 깊이(= 부모)를 정한다.
// DOM 에 의존하지 않는다 — 좌표 보정은 호출부(Timeline.tsx)가 끝내서 넘긴다.
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';
import type { TreeNode } from '../components/NodeTree';

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

/** 자기 자신을 포함한 자손 id 집합. */
export function descendantIdsOf(items: NodeTreeItem[], nodeId: string): Set<string> {
  const out = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const it of items) {
      if (it.parentId === cur && !out.has(it.id)) {
        out.add(it.id);
        stack.push(it.id);
      }
    }
  }
  return out;
}

/** 서브트리가 자기 아래로 몇 단계까지 뻗는지. 자손이 없으면 0. */
export function subtreeRelativeDepth(items: NodeTreeItem[], nodeId: string): number {
  const ids = descendantIdsOf(items, nodeId);
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

  if (parentId !== null) {
    const parent = items.find((n) => n.id === parentId);
    if (!parent) return { ok: false, reason: '대상 그룹을 찾을 수 없습니다' };
    if (descendantIdsOf(items, node.id).has(parentId)) {
      return { ok: false, reason: '자기 하위로는 옮길 수 없습니다' };
    }
    if (parent.kind !== 'GROUP') {
      return { ok: false, reason: '일반 항목에는 넣을 수 없습니다' };
    }
    parentDepth = parent.depth;
  }

  const newDepth = parentDepth + 1;
  if (newDepth + subtreeRelativeDepth(items, node.id) >= MAX_TREE_DEPTH) {
    return { ok: false, reason: `최대 깊이 ${MAX_TREE_DEPTH}단계를 넘습니다` };
  }
  return { ok: true };
}
