import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import type { TreeNode } from '../components/NodeTree';
import { INDENT_PX, LABEL_BASE_PX, depthRangeAt, depthFromX, descendantIdsOf, subtreeRelativeDepth, canDropInto } from './treeDnd';

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

//   G          (GROUP, d0)
//     GC       (GROUP, d1)
//       L      (ITEM,  d2)
//   S          (ITEM,  d0)
const ITEMS: NodeTreeItem[] = [
  item({ id: 'G', kind: 'GROUP', depth: 0, sortOrder: 1 }),
  item({ id: 'GC', kind: 'GROUP', depth: 1, sortOrder: 1, parentId: 'G' }),
  item({ id: 'L', kind: 'ITEM', depth: 2, sortOrder: 1, parentId: 'GC' }),
  item({ id: 'S', kind: 'ITEM', depth: 0, sortOrder: 2 }),
];

function byId(id: string): NodeTreeItem {
  const found = ITEMS.find((n) => n.id === id);
  if (!found) throw new Error(`no such test node: ${id}`);
  return found;
}

describe('descendantIdsOf', () => {
  it('자기 자신을 포함해 자손을 모은다', () => {
    expect(descendantIdsOf(ITEMS, 'G')).toEqual(new Set(['G', 'GC', 'L']));
    expect(descendantIdsOf(ITEMS, 'L')).toEqual(new Set(['L']));
  });
});

describe('subtreeRelativeDepth', () => {
  it('자손이 없으면 0, 있으면 가장 깊은 자손까지의 상대 깊이', () => {
    expect(subtreeRelativeDepth(ITEMS, 'L')).toBe(0);
    expect(subtreeRelativeDepth(ITEMS, 'GC')).toBe(1);
    expect(subtreeRelativeDepth(ITEMS, 'G')).toBe(2);
  });
});

describe('canDropInto', () => {
  it('최상위로 옮기는 건 언제나 된다', () => {
    expect(canDropInto(ITEMS, byId('GC'), null)).toEqual({ ok: true });
  });

  it('자기 자신 밑으로는 못 옮긴다', () => {
    expect(canDropInto(ITEMS, byId('G'), 'G')).toEqual({
      ok: false,
      reason: '자기 하위로는 옮길 수 없습니다',
    });
  });

  it('자손 밑으로는 못 옮긴다', () => {
    expect(canDropInto(ITEMS, byId('G'), 'GC')).toEqual({
      ok: false,
      reason: '자기 하위로는 옮길 수 없습니다',
    });
  });

  it('ITEM 은 부모가 될 수 없다', () => {
    expect(canDropInto(ITEMS, byId('G'), 'S')).toEqual({
      ok: false,
      reason: '일반 항목에는 넣을 수 없습니다',
    });
  });

  it('서브트리 깊이를 더해 최대 깊이를 넘으면 거절한다', () => {
    // 깊이 8 짜리 GROUP 아래에 상대깊이 2 인 G 를 넣으면 9+2 = 11 > 10
    const deep: NodeTreeItem[] = [
      ...ITEMS,
      item({ id: 'D8', kind: 'GROUP', depth: 8, sortOrder: 9 }),
    ];
    expect(canDropInto(deep, byId('G'), 'D8')).toEqual({
      ok: false,
      reason: '최대 깊이 10단계를 넘습니다',
    });
  });

  it('없는 부모를 지정하면 거절한다', () => {
    expect(canDropInto(ITEMS, byId('G'), 'nope').ok).toBe(false);
  });
});
