import { describe, expect, it } from 'vitest';
import type { UserGroupItem } from '@sam/shared';
import { flattenGroupTree } from './groupTreeView';

function g(id: string, parentId: string | null, name = id): UserGroupItem {
  return {
    id,
    name,
    parentId,
    description: null,
    directMemberCount: 0,
    totalMemberCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('flattenGroupTree', () => {
  it('최상위부터 깊이 우선으로 늘어놓고 깊이를 함께 준다', () => {
    const rows = flattenGroupTree([
      g('mech', 'center', '기구완성팀'),
      g('center', null, '운영기술센터'),
      g('purchase', null, '구매팀'),
    ]);
    // '구매팀'(purchase)이 '운영기술센터'(center)보다 한글 정렬 순서(ㄱ < ㅇ)에서 앞선다.
    // 최상위 형제 사이의 정렬은 이름순이라 purchase 가 먼저 오고, 그다음 depth-first 로
    // center 와 그 자손 mech 가 이어진다.
    expect(rows.map((r) => [r.group.id, r.depth])).toEqual([
      ['purchase', 0],
      ['center', 0],
      ['mech', 1],
    ]);
  });

  it('같은 깊이에서는 이름순으로 늘어놓는다', () => {
    const rows = flattenGroupTree([g('b', null, '나팀'), g('a', null, '가팀')]);
    expect(rows.map((r) => r.group.id)).toEqual(['a', 'b']);
  });

  it('부모가 사라진 고아 그룹도 빠뜨리지 않고 최상위로 보여 준다', () => {
    const rows = flattenGroupTree([g('orphan', 'gone')]);
    expect(rows.map((r) => r.group.id)).toEqual(['orphan']);
  });

  it('데이터가 순환해도 무한히 돌지 않는다', () => {
    const rows = flattenGroupTree([g('a', 'b'), g('b', 'a')]);
    expect(rows).toHaveLength(2);
  });

  it('빈 목록은 빈 배열', () => {
    expect(flattenGroupTree([])).toEqual([]);
  });
});
