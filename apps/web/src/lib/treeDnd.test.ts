import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import type { TreeNode } from '../components/NodeTree';
import { INDENT_PX, LABEL_BASE_PX, depthRangeAt, depthFromX } from './treeDnd';

function item(
  partial: Partial<NodeTreeItem> & { id: string; kind: NodeTreeItem['kind'] },
): NodeTreeItem {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    description: null,
    startAt: null,
    endAt: null,
    startAtEffective: null,
    endAtEffective: null,
    progress: 0,
    progressEffective: null,
    sortOrder: 1,
    depth: 0,
    createdById: 'u1',
    updatedById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as NodeTreeItem;
}

// rows 는 화면에 보이는 순서대로 나열한 평탄화 결과다.
// children 은 depthRangeAt/resolveTarget 이 쓰지 않으므로 빈 배열로 둔다.
function row(
  partial: Partial<NodeTreeItem> & { id: string; kind: NodeTreeItem['kind'] },
): TreeNode {
  return { ...item(partial), children: [] };
}

//   G      (GROUP, depth 0)
//     C1   (ITEM,  depth 1)
//   S      (ITEM,  depth 0)
const ROWS: TreeNode[] = [
  row({ id: 'G', kind: 'GROUP', depth: 0, sortOrder: 1 }),
  row({ id: 'C1', kind: 'ITEM', depth: 1, sortOrder: 1, parentId: 'G' }),
  row({ id: 'S', kind: 'ITEM', depth: 0, sortOrder: 2 }),
];

describe('depthRangeAt', () => {
  it('트리 맨 위 경계는 깊이 0 으로 고정된다', () => {
    expect(depthRangeAt(ROWS, 0)).toEqual({ minDepth: 0, maxDepth: 0 });
  });

  it('above 가 펼쳐진 GROUP 이면 그 그룹의 첫 자식까지 허용한다', () => {
    // boundary 1 = G 와 C1 사이. above=G(GROUP, d0), below=C1(d1)
    expect(depthRangeAt(ROWS, 1)).toEqual({ minDepth: 1, maxDepth: 1 });
  });

  it('above 가 ITEM 이면 그 ITEM 의 깊이가 상한이다', () => {
    // boundary 2 = C1 과 S 사이. above=C1(ITEM, d1), below=S(d0)
    expect(depthRangeAt(ROWS, 2)).toEqual({ minDepth: 0, maxDepth: 1 });
  });

  it('below 가 없는 마지막 경계는 최상위까지 내려갈 수 있다', () => {
    // boundary 3 = S 아래. above=S(ITEM, d0), below=없음
    expect(depthRangeAt(ROWS, 3)).toEqual({ minDepth: 0, maxDepth: 0 });
  });
});

describe('depthFromX', () => {
  it('가로 좌표를 들여쓰기 한 칸 단위로 읽어 범위 안으로 clamp 한다', () => {
    // boundary 2 는 0..1 허용
    expect(depthFromX(ROWS, 2, LABEL_BASE_PX)).toBe(0);
    expect(depthFromX(ROWS, 2, LABEL_BASE_PX + INDENT_PX)).toBe(1);
    expect(depthFromX(ROWS, 2, LABEL_BASE_PX + INDENT_PX * 5)).toBe(1); // 상한 clamp
    expect(depthFromX(ROWS, 2, -100)).toBe(0); // 하한 clamp
  });

  it('한 칸의 절반을 넘으면 다음 깊이로 반올림한다', () => {
    expect(depthFromX(ROWS, 2, LABEL_BASE_PX + INDENT_PX * 0.4)).toBe(0);
    expect(depthFromX(ROWS, 2, LABEL_BASE_PX + INDENT_PX * 0.6)).toBe(1);
  });
});
