import { describe, expect, it } from 'vitest';
import {
  MAX_GROUP_DEPTH,
  canReparentGroup,
  collectDescendantGroupIds,
  directMembersOf,
  expandGroupMembers,
  groupCheckState,
  groupDepthOf,
  groupPathNames,
  groupPathOfUser,
  subtreeHeightOf,
  type GroupMembership,
  type GroupNode,
} from './user-groups';

/**
 * 확정명세 §2 의 조직도를 그대로 옮긴 표본.
 *
 *   운영기술센터
 *   ├─ 기구완성팀
 *   ├─ 생산기술팀
 *   ├─ 품질보증팀
 *   └─ (센터장은 팀에 속하지 않고 센터 직속)
 *   구매팀
 */
const SAMPLE: GroupNode[] = [
  { id: 'center', parentId: null },
  { id: 'mech', parentId: 'center' },
  { id: 'prod', parentId: 'center' },
  { id: 'qa', parentId: 'center' },
  { id: 'purchase', parentId: null },
];

/** 센터장 1명 + 기구완성 5 + 생산기술 8 + 품질보증 7 = 21명, 구매팀 3명. */
const MEMBERSHIPS: GroupMembership[] = [
  { groupId: 'center', userId: 'head' },
  ...Array.from({ length: 5 }, (_, i) => ({ groupId: 'mech', userId: `mech${i}` })),
  ...Array.from({ length: 8 }, (_, i) => ({ groupId: 'prod', userId: `prod${i}` })),
  ...Array.from({ length: 7 }, (_, i) => ({ groupId: 'qa', userId: `qa${i}` })),
  ...Array.from({ length: 3 }, (_, i) => ({ groupId: 'purchase', userId: `pur${i}` })),
];

describe('collectDescendantGroupIds', () => {
  it('자기 자신을 포함한다', () => {
    expect(collectDescendantGroupIds(SAMPLE, ['mech'])).toEqual(new Set(['mech']));
  });

  it('자손을 모두 모은다', () => {
    expect(collectDescendantGroupIds(SAMPLE, ['center'])).toEqual(
      new Set(['center', 'mech', 'prod', 'qa']),
    );
  });

  it('여러 뿌리를 한꺼번에 받아 합집합을 돌려준다', () => {
    expect(collectDescendantGroupIds(SAMPLE, ['mech', 'purchase'])).toEqual(
      new Set(['mech', 'purchase']),
    );
  });

  it('없는 id 는 조용히 무시한다', () => {
    expect(collectDescendantGroupIds(SAMPLE, ['nope'])).toEqual(new Set());
  });

  it('데이터가 순환해도 무한히 돌지 않는다', () => {
    const cyclic: GroupNode[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(collectDescendantGroupIds(cyclic, ['a'])).toEqual(new Set(['a', 'b']));
  });
});

describe('expandGroupMembers', () => {
  it('확정명세 예시 1 — 운영기술센터를 고르면 21명 전원', () => {
    const ids = expandGroupMembers(SAMPLE, MEMBERSHIPS, ['center']);
    expect(ids).toHaveLength(21);
    expect(ids).toContain('head');
    expect(ids).toContain('mech0');
    expect(ids).toContain('qa6');
    expect(ids).not.toContain('pur0');
  });

  it('확정명세 예시 2 — 기구완성팀만 고르면 5명', () => {
    expect(expandGroupMembers(SAMPLE, MEMBERSHIPS, ['mech'])).toHaveLength(5);
  });

  it('형제 그룹을 함께 골라도 중복 없이 합친다', () => {
    const ids = expandGroupMembers(SAMPLE, MEMBERSHIPS, ['mech', 'prod']);
    expect(ids).toHaveLength(13);
    expect(new Set(ids).size).toBe(13);
  });

  it('상위와 하위를 함께 골라도 사람이 두 번 세어지지 않는다', () => {
    expect(expandGroupMembers(SAMPLE, MEMBERSHIPS, ['center', 'mech'])).toHaveLength(21);
  });

  it('한 사람이 두 그룹에 속해 있어도 한 번만 센다', () => {
    const dual: GroupMembership[] = [
      { groupId: 'mech', userId: 'x' },
      { groupId: 'purchase', userId: 'x' },
    ];
    expect(expandGroupMembers(SAMPLE, dual, ['mech', 'purchase'])).toEqual(['x']);
  });

  it('빈 그룹을 고르면 빈 배열', () => {
    expect(expandGroupMembers(SAMPLE, [], ['center'])).toEqual([]);
  });

  it('아무 그룹도 고르지 않으면 빈 배열', () => {
    expect(expandGroupMembers(SAMPLE, MEMBERSHIPS, [])).toEqual([]);
  });
});

describe('groupDepthOf', () => {
  it('최상위는 1', () => {
    expect(groupDepthOf(SAMPLE, 'center')).toBe(1);
  });

  it('한 단계 아래는 2', () => {
    expect(groupDepthOf(SAMPLE, 'mech')).toBe(2);
  });

  it('없는 그룹은 0', () => {
    expect(groupDepthOf(SAMPLE, 'nope')).toBe(0);
  });

  it('데이터가 순환하면 무한대를 돌려준다 (무한 루프에 빠지지 않는다)', () => {
    const cyclic: GroupNode[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(groupDepthOf(cyclic, 'a')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('subtreeHeightOf', () => {
  it('잎은 1', () => {
    expect(subtreeHeightOf(SAMPLE, 'mech')).toBe(1);
  });

  it('자식이 있으면 2', () => {
    expect(subtreeHeightOf(SAMPLE, 'center')).toBe(2);
  });
});

describe('canReparentGroup', () => {
  it('평범한 이동은 허용한다', () => {
    expect(canReparentGroup(SAMPLE, 'purchase', 'center')).toEqual({ ok: true });
  });

  it('최상위로 올리는 것도 허용한다', () => {
    expect(canReparentGroup(SAMPLE, 'mech', null)).toEqual({ ok: true });
  });

  it('자기 자신을 상위로 지정하면 CYCLE', () => {
    expect(canReparentGroup(SAMPLE, 'center', 'center')).toEqual({
      ok: false,
      reason: 'CYCLE',
    });
  });

  it('자기 자손을 상위로 지정하면 CYCLE', () => {
    expect(canReparentGroup(SAMPLE, 'center', 'mech')).toEqual({
      ok: false,
      reason: 'CYCLE',
    });
  });

  it('깊이가 상한을 넘으면 DEPTH', () => {
    // 8단계 사슬을 만든 뒤, 잎에 또 하나를 붙이려 하면 9단계가 되어 거부된다.
    const chain: GroupNode[] = Array.from({ length: MAX_GROUP_DEPTH }, (_, i) => ({
      id: `g${i}`,
      parentId: i === 0 ? null : `g${i - 1}`,
    }));
    chain.push({ id: 'loose', parentId: null });
    expect(canReparentGroup(chain, 'loose', `g${MAX_GROUP_DEPTH - 1}`)).toEqual({
      ok: false,
      reason: 'DEPTH',
    });
  });

  it('자손까지 밀려 상한을 넘으면 DEPTH — 옮기는 그룹의 높이를 함께 본다', () => {
    // g0..g6 (7단계) 사슬 + 높이 2 짜리 별도 묶음.
    const chain: GroupNode[] = Array.from({ length: MAX_GROUP_DEPTH - 1 }, (_, i) => ({
      id: `g${i}`,
      parentId: i === 0 ? null : `g${i - 1}`,
    }));
    chain.push({ id: 'parent', parentId: null });
    chain.push({ id: 'child', parentId: 'parent' });
    // parent 를 g6 아래(8단계)에 두면 child 가 9단계가 되므로 거부해야 한다.
    expect(canReparentGroup(chain, 'parent', `g${MAX_GROUP_DEPTH - 2}`)).toEqual({
      ok: false,
      reason: 'DEPTH',
    });
  });
});

describe('groupPathNames', () => {
  const named = [
    { id: 'center', parentId: null, name: '운영기술센터' },
    { id: 'mech', parentId: 'center', name: '기구완성팀' },
  ];

  it('최상위부터 차례로 이름을 돌려준다', () => {
    expect(groupPathNames(named, 'mech')).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('없는 그룹은 빈 배열', () => {
    expect(groupPathNames(named, 'nope')).toEqual([]);
  });
});

describe('groupPathOfUser', () => {
  const NAMED = [
    { id: 'center', parentId: null, name: '운영기술센터' },
    { id: 'mech', parentId: 'center', name: '기구완성팀' },
    { id: 'qa', parentId: 'center', name: '품질보증팀' },
    { id: 'purchase', parentId: null, name: '구매팀' },
  ];

  it('말단 팀에 속한 사람은 경로 전체를 돌려준다', () => {
    const m: GroupMembership[] = [{ groupId: 'mech', userId: 'u1' }];
    expect(groupPathOfUser(NAMED, m, 'u1')).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('최상위 직속인 사람은 한 원소만 돌려준다', () => {
    const m: GroupMembership[] = [{ groupId: 'center', userId: 'head' }];
    expect(groupPathOfUser(NAMED, m, 'head')).toEqual(['운영기술센터']);
  });

  it('소속이 없으면 빈 배열', () => {
    expect(groupPathOfUser(NAMED, [], 'u1')).toEqual([]);
  });

  it('없는 사용자면 빈 배열', () => {
    const m: GroupMembership[] = [{ groupId: 'mech', userId: 'u1' }];
    expect(groupPathOfUser(NAMED, m, 'nobody')).toEqual([]);
  });

  it('두 그룹에 걸친 데이터면 말단 이름의 가나다순 첫 번째를 고른다', () => {
    // 기구완성팀(ㄱ) < 품질보증팀(ㅍ) 이므로 기구완성팀 경로가 나와야 한다.
    const m: GroupMembership[] = [
      { groupId: 'qa', userId: 'dual' },
      { groupId: 'mech', userId: 'dual' },
    ];
    expect(groupPathOfUser(NAMED, m, 'dual')).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('소속 그룹이 목록에 없으면 빈 배열', () => {
    const m: GroupMembership[] = [{ groupId: 'gone', userId: 'u1' }];
    expect(groupPathOfUser(NAMED, m, 'u1')).toEqual([]);
  });
});

describe('groupCheckState', () => {
  it('아무것도 고르지 않았으면 unchecked', () => {
    expect(groupCheckState(SAMPLE, new Set(), 'center')).toBe('unchecked');
  });

  it('자기 자신과 모든 자손이 있으면 checked', () => {
    const picked = new Set(['center', 'mech', 'prod', 'qa']);
    expect(groupCheckState(SAMPLE, picked, 'center')).toBe('checked');
  });

  it('자기 자신은 있으나 빠진 자손이 있으면 indeterminate', () => {
    const picked = new Set(['center', 'mech', 'prod']); // qa 가 빠졌다
    expect(groupCheckState(SAMPLE, picked, 'center')).toBe('indeterminate');
  });

  it('자기 자신은 없으나 자손 중 하나가 있으면 indeterminate', () => {
    expect(groupCheckState(SAMPLE, new Set(['mech']), 'center')).toBe('indeterminate');
  });

  it('자손이 없는 그룹은 자기 자신만으로 판정한다', () => {
    expect(groupCheckState(SAMPLE, new Set(['mech']), 'mech')).toBe('checked');
    expect(groupCheckState(SAMPLE, new Set(), 'mech')).toBe('unchecked');
  });

  it('없는 그룹은 unchecked', () => {
    expect(groupCheckState(SAMPLE, new Set(['center']), 'nope')).toBe('unchecked');
  });

  it('데이터가 순환해도 무한히 돌지 않는다', () => {
    const cyclic: GroupNode[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(groupCheckState(cyclic, new Set(['a']), 'a')).toBe('indeterminate');
  });
});

describe('directMembersOf', () => {
  it('자손을 따라가지 않는다', () => {
    // center 를 골랐어도 자손(mech·prod·qa)의 인원은 포함되지 않아야 한다.
    // expandGroupMembers 와 다른 점이며, 이것이 이 함수의 존재 이유다.
    expect(directMembersOf(MEMBERSHIPS, ['center'])).toEqual(['head']);
  });

  it('여러 그룹의 합집합을 돌려준다', () => {
    const ids = directMembersOf(MEMBERSHIPS, ['center', 'mech']);
    expect(ids).toHaveLength(6);
    expect(ids).toContain('head');
    expect(ids).toContain('mech0');
  });

  it('한 사람이 두 그룹에 속해 있어도 한 번만 센다', () => {
    const dual: GroupMembership[] = [
      { groupId: 'mech', userId: 'x' },
      { groupId: 'qa', userId: 'x' },
    ];
    expect(directMembersOf(dual, ['mech', 'qa'])).toEqual(['x']);
  });

  it('빈 목록을 주면 빈 배열', () => {
    expect(directMembersOf(MEMBERSHIPS, [])).toEqual([]);
  });

  it('없는 그룹 id 는 조용히 무시한다', () => {
    expect(directMembersOf(MEMBERSHIPS, ['nope'])).toEqual([]);
  });

  it('반환 순서는 memberships 에 들어 있던 순서를 따른다', () => {
    const m: GroupMembership[] = [
      { groupId: 'mech', userId: 'second' },
      { groupId: 'center', userId: 'first' },
    ];
    expect(directMembersOf(m, ['center', 'mech'])).toEqual(['second', 'first']);
  });
});
