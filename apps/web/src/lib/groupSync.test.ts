import { describe, expect, it } from 'vitest';
import type { GroupProjectCoverage } from '@sam/shared';
import { buildAddSide, buildRemoveSide, markBlockedTargets, syncUserIds } from './groupSync';

function coverage(
  projectId: string,
  missingUserIds: string[],
  name = projectId,
): GroupProjectCoverage {
  return {
    projectId,
    name,
    status: 'ACTIVE',
    groupMemberCount: 3,
    participatingCount: 3 - missingUserIds.length,
    missingUserIds,
  };
}

const U1 = { id: 'u1', displayName: '김하나' };
const U2 = { id: 'u2', displayName: '이두리' };
const U3 = { id: 'u3', displayName: '박세연' };

describe('buildAddSide', () => {
  it('프로젝트가 없으면 undefined', () => {
    expect(buildAddSide('구매팀', [], [U1])).toBeUndefined();
  });

  it('대상 인원이 없으면 undefined', () => {
    expect(buildAddSide('구매팀', [coverage('p1', [])], [])).toBeUndefined();
  });

  it('아직 참여하지 않은 사람만 넣는다', () => {
    // p1 에 u1 만 빠져 있으므로 u2 는 넣을 필요가 없다.
    const side = buildAddSide('구매팀', [coverage('p1', ['u1'])], [U1, U2]);
    expect(side?.groupName).toBe('구매팀');
    expect(side?.targets[0]?.users).toEqual([U1]);
    // 집계는 화면 표시에 그대로 쓰이므로 원본을 옮겨 담는다.
    expect(side?.targets[0]?.participatingCount).toBe(2);
  });

  it('전원이 이미 참여 중인 프로젝트는 목록에서 뺀다', () => {
    // 이전 소속과 새 소속이 같은 프로젝트에 참여하면, 그 프로젝트가 빼기 목록과 넣기
    // 목록에 동시에 뜨던 문제를 막는 자리다.
    const side = buildAddSide('구매팀', [coverage('p1', []), coverage('p2', ['u1'])], [U1]);
    expect(side?.targets.map((t) => t.projectId)).toEqual(['p2']);
  });

  it('넣을 사람이 한 명도 없으면 undefined', () => {
    expect(buildAddSide('구매팀', [coverage('p1', [])], [U1, U2])).toBeUndefined();
  });
});

describe('markBlockedTargets', () => {
  const side = () =>
    buildRemoveSide([{ groupName: '기구팀', coverage: [coverage('p1', [])], users: [U1, U2] }])!;

  it('남는 MANAGER 가 없으면 이유를 달아 막는다', () => {
    const marked = markBlockedTargets(side(), new Map([['p1', ['u1']]]));
    expect(marked.targets[0]?.blockedReason).toContain('MANAGER');
  });

  it('빠지지 않는 MANAGER 가 남으면 막지 않는다', () => {
    const marked = markBlockedTargets(side(), new Map([['p1', ['u1', 'keeper']]]));
    expect(marked.targets[0]?.blockedReason).toBeNull();
  });

  it('대상 중에 MANAGER 가 없으면 막지 않는다', () => {
    const marked = markBlockedTargets(side(), new Map([['p1', ['keeper']]]));
    expect(marked.targets[0]?.blockedReason).toBeNull();
  });

  it('MANAGER 를 모르는 프로젝트는 판단하지 않는다', () => {
    const marked = markBlockedTargets(side(), new Map());
    expect(marked.targets[0]?.blockedReason).toBeNull();
  });
});

describe('buildRemoveSide', () => {
  it('뺄 사람이 남는 프로젝트가 없으면 undefined', () => {
    // p1 에 u1 이 참여하지 않으므로 뺄 것이 없다.
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', ['u1'])], users: [U1] },
    ]);
    expect(side).toBeUndefined();
  });

  it('그 프로젝트에 실제로 참여 중인 사람만 남긴다', () => {
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', ['u2'])], users: [U1, U2] },
    ]);
    expect(side?.targets).toHaveLength(1);
    expect(side?.targets[0]?.users).toEqual([U1]);
  });

  it('이전 그룹과 무관한 사람은 애초에 대상에 들지 않는다', () => {
    // 무소속이던 u3 은 이전 그룹의 인원이 아니므로 users 에 오지 않는다.
    // 그가 그 프로젝트에 직접 참여 중이더라도(=missingUserIds 에 없더라도) 빠지지 않아야 한다.
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', [])], users: [U1, U2] },
    ]);
    expect(side?.targets[0]?.users.map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('이전 그룹이 여럿이면 모두 다루고 이름을 함께 남긴다', () => {
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', [])], users: [U1] },
      { groupName: '구매팀', coverage: [coverage('p2', [])], users: [U2] },
    ]);
    expect(side?.groupNames).toEqual(['기구팀', '구매팀']);
    expect(side?.targets.map((t) => t.projectId)).toEqual(['p1', 'p2']);
  });

  it('같은 프로젝트가 두 그룹에 걸리면 사람을 합집합으로 모은다', () => {
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', [])], users: [U1, U2] },
      { groupName: '구매팀', coverage: [coverage('p1', [])], users: [U2, U3] },
    ]);
    expect(side?.targets).toHaveLength(1);
    expect(side?.targets[0]?.users.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('한 명도 기여하지 못한 그룹의 이름은 담지 않는다', () => {
    const side = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', [])], users: [U1] },
      { groupName: '빈팀', coverage: [coverage('p2', ['u2'])], users: [U2] },
    ]);
    expect(side?.groupNames).toEqual(['기구팀']);
  });
});

describe('syncUserIds', () => {
  it('양쪽에 등장하는 사람을 중복 없이 모은다', () => {
    const addTo = buildAddSide('구매팀', [coverage('p2', ['u1', 'u2'])], [U1, U2]);
    const removeFrom = buildRemoveSide([
      { groupName: '기구팀', coverage: [coverage('p1', [])], users: [U2, U3] },
    ]);
    expect(syncUserIds([addTo, removeFrom]).sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('undefined 는 건너뛴다', () => {
    expect(syncUserIds([undefined, undefined])).toEqual([]);
  });
});
