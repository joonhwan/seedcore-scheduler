import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import type { TreeNode } from '../components/NodeTree';
import { INDENT_PX, LABEL_BASE_PX, depthRangeAt, depthFromX, descendantIdsOf, subtreeRelativeDepth, canDropInto, resolveTarget, siblingsExcluding, sortOrderForTarget, changesParent, targetFromPointer, describeDropTarget, appendSortOrder, type DropTarget } from './treeDnd';

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

//   G          (GROUP, d0, sortOrder 1)
//     C1       (ITEM,  d1, sortOrder 1)
//     C2       (ITEM,  d1, sortOrder 2)
//   S          (ITEM,  d0, sortOrder 2)
const T_ITEMS: NodeTreeItem[] = [
  item({ id: 'G', kind: 'GROUP', depth: 0, sortOrder: 1 }),
  item({ id: 'C1', kind: 'ITEM', depth: 1, sortOrder: 1, parentId: 'G' }),
  item({ id: 'C2', kind: 'ITEM', depth: 1, sortOrder: 2, parentId: 'G' }),
  item({ id: 'S', kind: 'ITEM', depth: 0, sortOrder: 2 }),
];
const T_ROWS: TreeNode[] = T_ITEMS.map((n) => ({ ...n, children: [] }));
function tById(id: string): NodeTreeItem {
  const found = T_ITEMS.find((n) => n.id === id);
  if (!found) throw new Error(`no such test node: ${id}`);
  return found;
}

describe('siblingsExcluding', () => {
  it('sortOrder 순으로 정렬하고 자기 자신을 뺀다', () => {
    expect(siblingsExcluding(T_ITEMS, 'G', 'C1').map((n) => n.id)).toEqual(['C2']);
    expect(siblingsExcluding(T_ITEMS, null, 'zzz').map((n) => n.id)).toEqual(['G', 'S']);
  });
});

describe('resolveTarget', () => {
  it('트리 맨 위 경계는 최상위 맨 앞이다', () => {
    // S 를 최상위 첫 번째로
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('S'), 0, 0);
    expect(t).toMatchObject({ parentId: null, insertIndex: 0, ok: true });
    expect(sortOrderForTarget(t)).toBe(1);
  });

  it('GROUP 바로 아래 경계에서 한 단계 깊으면 그 그룹의 첫 자식이 된다', () => {
    // boundary 1 = G 와 C1 사이, depth 1 → G 의 첫 자식
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('S'), 1, 1);
    expect(t).toMatchObject({ parentId: 'G', insertIndex: 0, ok: true });
    expect(sortOrderForTarget(t)).toBe(1);
  });

  it('같은 경계라도 얕은 깊이를 고르면 부모가 달라진다', () => {
    // boundary 3 = C2 와 S 사이.
    // depth 1 → G 안, C2 뒤
    const deep = resolveTarget(T_ROWS, T_ITEMS, tById('S'), 3, 1);
    expect(deep).toMatchObject({ parentId: 'G', insertIndex: 2, ok: true });
    expect(sortOrderForTarget(deep)).toBe(3);
    // depth 0 → 최상위, G 뒤
    const shallow = resolveTarget(T_ROWS, T_ITEMS, tById('S'), 3, 0);
    expect(shallow).toMatchObject({ parentId: null, insertIndex: 1, ok: true });
    expect(sortOrderForTarget(shallow)).toBe(2);
  });

  it('트리 맨 끝 경계에서 깊이 0 이면 최상위 맨 뒤로 간다', () => {
    // boundary 4 = S 아래. C1 을 최상위 맨 뒤로
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 4, 0);
    expect(t).toMatchObject({ parentId: null, insertIndex: 2, ok: true });
    expect(sortOrderForTarget(t)).toBe(3);
  });

  it('같은 부모 안에서 아래로 옮기는 위치를 맞게 계산한다', () => {
    // C1 을 boundary 3(C2 와 S 사이), depth 1 → G 안 C2 뒤.
    // 자기 자신을 뺀 형제는 [C2] 이므로 insertIndex 1
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 3, 1);
    expect(t).toMatchObject({ parentId: 'G', insertIndex: 1, ok: true });
    expect(sortOrderForTarget(t)).toBe(2);
  });

  it('자기 하위로 가는 대상은 사유를 달고 ok=false 로 돌아온다', () => {
    // boundary 1 = G 와 C1 사이, depth 1 → 부모가 G. G 자신을 드래그 중이면 무효.
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('G'), 1, 1);
    expect(t.ok).toBe(false);
    expect(t.reason).toBe('자기 하위로는 옮길 수 없습니다');
  });

  it('깊이 초과 대상도 사유를 달고 ok=false 로 돌아온다', () => {
    const deepItems: NodeTreeItem[] = [
      item({ id: 'D8', kind: 'GROUP', depth: 8, sortOrder: 1 }),
      item({ id: 'D9', kind: 'ITEM', depth: 9, sortOrder: 1, parentId: 'D8' }),
      item({ id: 'BIG', kind: 'GROUP', depth: 0, sortOrder: 2 }),
      item({ id: 'BIGC', kind: 'ITEM', depth: 1, sortOrder: 1, parentId: 'BIG' }),
    ];
    const deepRows: TreeNode[] = deepItems.map((n) => ({ ...n, children: [] }));
    const bigNode = deepItems.find((n) => n.id === 'BIG')!;
    // boundary 1 = D8 과 D9 사이, depth 9 → 부모 D8. BIG 은 상대깊이 1 이라 9+1 = 10 >= 10
    const t = resolveTarget(deepRows, deepItems, bigNode, 1, 9);
    expect(t.ok).toBe(false);
    expect(t.reason).toBe('최대 깊이 10단계를 넘습니다');
  });

  it('조상이 드래그 중인 노드 자신이면 지금 자리를 그대로 쓴다', () => {
    // boundary 2 = C1 과 C2 사이. above=C1 이고 C1 을 드래그 중이므로
    // 조상 탐색이 곧바로 C1(=자기 자신)에서 멈춘다.
    // 자기 자신을 뺀 형제는 [C2] 뿐이고 C2.sortOrder(2) > C1.sortOrder(1) 이라 insertIndex 0.
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 2, 1);
    expect(t).toMatchObject({ parentId: 'G', insertIndex: 0, ok: true });
  });
});

describe('changesParent', () => {
  it('부모가 바뀌는지로 표시 색을 가른다', () => {
    const same = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 3, 1); // G 안 그대로
    expect(changesParent(tById('C1'), same)).toBe(false);
    const moved = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 4, 0); // 최상위로
    expect(changesParent(tById('C1'), moved)).toBe(true);
  });
});

describe('targetFromPointer', () => {
  const X_D0 = LABEL_BASE_PX;              // 깊이 0 을 가리키는 가로 좌표
  const X_D1 = LABEL_BASE_PX + INDENT_PX;  // 깊이 1

  it('행의 위 절반은 그 행 위 경계, 아래 절반은 아래 경계로 읽는다', () => {
    // rows: [G, C1, C2, S]. S 를 드래그 중.
    // C1 행(index 1)의 위 절반 → boundary 1 → depth 1 → G 의 첫 자식
    const up = targetFromPointer(T_ROWS, T_ITEMS, tById('S'), X_D1, 32 * 1 + 4);
    expect(up).toMatchObject({ boundary: 1, parentId: 'G', insertIndex: 0 });
    // C1 행의 아래 절반 → boundary 2 → depth 1 → G 안 C1 뒤
    const down = targetFromPointer(T_ROWS, T_ITEMS, tById('S'), X_D1, 32 * 1 + 28);
    expect(down).toMatchObject({ boundary: 2, parentId: 'G', insertIndex: 1 });
  });

  it('가로 위치로 깊이가 갈린다', () => {
    // C2 행(index 2)의 아래 절반 → boundary 3. C1 을 드래그 중.
    // depth 1 → G 안 C2 뒤 / depth 0 → 최상위 G 뒤. 세로는 같고 가로만 다르다.
    const deep = targetFromPointer(T_ROWS, T_ITEMS, tById('C1'), X_D1, 32 * 2 + 28);
    expect(deep).toMatchObject({ parentId: 'G' });
    const shallow = targetFromPointer(T_ROWS, T_ITEMS, tById('C1'), X_D0, 32 * 2 + 28);
    expect(shallow).toMatchObject({ parentId: null });
  });

  it('제자리면 null 을 돌려준다', () => {
    // C1(G 의 첫 자식)을 드래그 중. 자기 행 위 절반과 아래 절반 둘 다 제자리.
    expect(targetFromPointer(T_ROWS, T_ITEMS, tById('C1'), X_D1, 32 * 1 + 4)).toBeNull();
    expect(targetFromPointer(T_ROWS, T_ITEMS, tById('C1'), X_D1, 32 * 1 + 28)).toBeNull();
  });

  it('범위를 벗어난 세로 좌표는 양 끝 경계로 clamp 한다', () => {
    expect(targetFromPointer(T_ROWS, T_ITEMS, tById('S'), X_D0, -500)?.boundary).toBe(0);
    expect(targetFromPointer(T_ROWS, T_ITEMS, tById('C1'), X_D0, 99999)?.boundary).toBe(4);
  });
});

describe('describeDropTarget', () => {
  it('같은 부모면 순서만 알려주고 sky 다', () => {
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 3, 1);
    expect(describeDropTarget(T_ITEMS, tById('C1'), t)).toEqual({
      text: '2번째로 이동',
      tone: 'sky',
    });
  });

  it('다른 부모 안으로 가면 부모 이름을 붙이고 amber 다', () => {
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('S'), 1, 1);
    expect(describeDropTarget(T_ITEMS, tById('S'), t)).toEqual({
      text: '"G" 안 1번째로 이동',
      tone: 'amber',
    });
  });

  it('최상위로 가면 최상위라고 적고 amber 다', () => {
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('C1'), 4, 0);
    expect(describeDropTarget(T_ITEMS, tById('C1'), t)).toEqual({
      text: '최상위 3번째로 이동',
      tone: 'amber',
    });
  });

  it('무효한 대상은 사유를 그대로 적고 rose 다', () => {
    const t = resolveTarget(T_ROWS, T_ITEMS, tById('G'), 1, 1);
    expect(describeDropTarget(T_ITEMS, tById('G'), t)).toEqual({
      text: '자기 하위로는 옮길 수 없습니다',
      tone: 'rose',
    });
  });
});

describe('appendSortOrder', () => {
  it('자기 자신을 뺀 자식 수 + 1 이다', () => {
    expect(appendSortOrder(T_ITEMS, 'G', 'C1')).toBe(2);
    expect(appendSortOrder(T_ITEMS, 'G', 'zzz')).toBe(3);
  });
});
