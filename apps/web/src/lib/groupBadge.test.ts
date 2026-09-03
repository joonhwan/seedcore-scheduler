import { describe, expect, it } from 'vitest';
import type { UserGroupTree } from '@sam/shared';
import { groupPathMapOf } from './groupBadge';

function tree(): UserGroupTree {
  return {
    groups: [
      {
        id: 'center',
        name: '운영기술센터',
        parentId: null,
        description: null,
        directMemberCount: 1,
        totalMemberCount: 3,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'mech',
        name: '기구완성팀',
        parentId: 'center',
        description: null,
        directMemberCount: 2,
        totalMemberCount: 2,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    memberships: [
      { groupId: 'center', userId: 'head' },
      { groupId: 'mech', userId: 'u1' },
    ],
  };
}

describe('groupPathMapOf', () => {
  it('사용자별 경로를 담은 맵을 돌려준다', () => {
    const map = groupPathMapOf(tree(), ['head', 'u1']);
    expect(map.get('head')).toEqual(['운영기술센터']);
    expect(map.get('u1')).toEqual(['운영기술센터', '기구완성팀']);
  });

  it('소속이 없는 사용자는 빈 배열', () => {
    expect(groupPathMapOf(tree(), ['nobody']).get('nobody')).toEqual([]);
  });

  it('그룹 정보가 아직 없으면(undefined) 모두 빈 배열을 돌려준다', () => {
    // 그룹은 곁다리 정보다. 못 받았다고 목록 자체가 오류로 보이면 안 된다.
    const map = groupPathMapOf(undefined, ['u1']);
    expect(map.get('u1')).toEqual([]);
  });

  it('사용자 목록이 비면 빈 맵', () => {
    expect(groupPathMapOf(tree(), []).size).toBe(0);
  });
});
