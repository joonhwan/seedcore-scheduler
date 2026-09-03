/**
 * 사용자 그룹(부서) 계층을 다루는 순수 함수 모음.
 *
 * 서버의 일괄 추가와 화면의 미리보기가 반드시 이 함수들을 함께 써야 한다. 화면이 "총 7명"이라고
 * 보여 준 숫자와 실제로 들어가는 인원이 어긋나면 관리자가 알아챌 방법이 없기 때문이다.
 *
 * 모든 함수는 데이터가 순환하더라도 무한히 돌지 않는다. DB 에는 순환을 막는 제약이 없고
 * (parent_id 자기참조뿐이다) 애플리케이션 검사가 유일한 방어선이라, 그 검사가 뚫린 데이터가
 * 들어와도 화면이 멈추지 않아야 한다.
 */

/** 조직 계층의 최대 깊이. 최상위가 1단계다. */
export const MAX_GROUP_DEPTH = 8;

/** 계층 계산에 필요한 최소 정보. UserGroupItem 이 구조적으로 이 모양을 만족한다. */
export interface GroupNode {
  id: string;
  parentId: string | null;
}

export interface GroupMembership {
  groupId: string;
  userId: string;
}

export type ReparentCheck = { ok: true } | { ok: false; reason: 'CYCLE' | 'DEPTH' };

/** parentId 로 자식을 찾기 위한 색인. */
function childrenIndex(groups: GroupNode[]): Map<string | null, GroupNode[]> {
  const map = new Map<string | null, GroupNode[]>();
  for (const g of groups) {
    const list = map.get(g.parentId);
    if (list) list.push(g);
    else map.set(g.parentId, [g]);
  }
  return map;
}

/**
 * 고른 그룹들과 그 자손 그룹의 id 를 모두 모은다.
 * 방문한 id 를 기록하며 넓이 우선으로 훑으므로 순환 데이터에서도 멈춘다.
 */
export function collectDescendantGroupIds(groups: GroupNode[], rootIds: string[]): Set<string> {
  const known = new Set(groups.map((g) => g.id));
  const children = childrenIndex(groups);
  const seen = new Set<string>();
  const queue = rootIds.filter((id) => known.has(id));

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of children.get(id) ?? []) {
      if (!seen.has(child.id)) queue.push(child.id);
    }
  }
  return seen;
}

/**
 * 고른 그룹들의 자손까지 포함한 사용자 id 를 중복 없이 돌려준다.
 * 반환 순서는 memberships 에 들어 있던 순서를 따른다 (화면 표시 순서를 안정적으로 두기 위함).
 */
export function expandGroupMembers(
  groups: GroupNode[],
  memberships: GroupMembership[],
  selectedGroupIds: string[],
): string[] {
  if (selectedGroupIds.length === 0) return [];
  const targets = collectDescendantGroupIds(groups, selectedGroupIds);
  if (targets.size === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of memberships) {
    if (!targets.has(m.groupId)) continue;
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    out.push(m.userId);
  }
  return out;
}

/**
 * 최상위부터 센 깊이. 최상위가 1이고, 없는 그룹은 0이다.
 * 조상을 MAX_GROUP_DEPTH + 1 번까지만 거슬러 올라가고, 그래도 뿌리에 닿지 못하면 순환으로 보아
 * 무한대를 돌려준다.
 */
export function groupDepthOf(groups: GroupNode[], groupId: string): number {
  const byId = new Map(groups.map((g) => [g.id, g]));
  let current = byId.get(groupId);
  if (!current) return 0;

  let depth = 1;
  while (current.parentId !== null) {
    if (depth > MAX_GROUP_DEPTH + 1) return Number.POSITIVE_INFINITY;
    const parent = byId.get(current.parentId);
    if (!parent) return depth; // 부모가 사라진 고아는 그 자리를 뿌리로 본다
    current = parent;
    depth += 1;
  }
  return depth;
}

/** 자기 자신을 포함한 부분 트리의 높이. 잎이 1이다. */
export function subtreeHeightOf(groups: GroupNode[], groupId: string): number {
  const children = childrenIndex(groups);
  const seen = new Set<string>();

  function walk(id: string, guard: number): number {
    if (seen.has(id) || guard > MAX_GROUP_DEPTH + 1) return 1;
    seen.add(id);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) return 1;
    let max = 1;
    for (const kid of kids) {
      const h = walk(kid.id, guard + 1) + 1;
      if (h > max) max = h;
    }
    return max;
  }
  return walk(groupId, 1);
}

/**
 * 상위 그룹을 바꿔도 되는지 판정한다.
 *
 * 두 가지를 본다.
 *  - CYCLE: 새 상위가 자기 자신이거나 자기 자손이면 그래프가 순환한다.
 *  - DEPTH: 옮긴 뒤의 깊이에 **옮기는 그룹의 높이**를 더한 값이 상한을 넘으면 자손이 밀려난다.
 *    자기 자신만 보면 자식을 데리고 가는 경우를 놓친다.
 */
export function canReparentGroup(
  groups: GroupNode[],
  groupId: string,
  newParentId: string | null,
): ReparentCheck {
  if (newParentId !== null) {
    const forbidden = collectDescendantGroupIds(groups, [groupId]);
    if (forbidden.has(newParentId)) return { ok: false, reason: 'CYCLE' };
  }

  const parentDepth = newParentId === null ? 0 : groupDepthOf(groups, newParentId);
  if (!Number.isFinite(parentDepth)) return { ok: false, reason: 'DEPTH' };

  const newDepth = parentDepth + 1;
  const height = subtreeHeightOf(groups, groupId);
  if (newDepth + height - 1 > MAX_GROUP_DEPTH) return { ok: false, reason: 'DEPTH' };

  return { ok: true };
}

/** 최상위부터 대상 그룹까지의 이름을 차례로 돌려준다. 화면의 소속 경로 표시에 쓴다. */
export function groupPathNames<T extends GroupNode & { name: string }>(
  groups: T[],
  groupId: string,
): string[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const names: string[] = [];
  let current = byId.get(groupId);
  let guard = 0;
  while (current && guard <= MAX_GROUP_DEPTH + 1) {
    names.unshift(current.name);
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
    guard += 1;
  }
  return names;
}

/**
 * 한 사용자의 소속 그룹 경로를 최상위부터 돌려준다. 소속이 없으면 빈 배열.
 *
 * 운영은 1인 1소속이지만 데이터베이스는 여러 소속을 허용한다(구조를 뜯어고치지 않고 겸직을
 * 열 수 있게 하려는 것이다). 그런 데이터가 들어오면 **말단 이름의 가나다순으로 첫 번째
 * 하나만** 쓴다. 화면이 조용히 하나만 고르는 것보다 여기에 규칙을 적어 두는 편이 낫다.
 *
 * 서버(MembersService)와 화면(사용자 관리·명단 편집기)이 이 함수를 함께 쓴다. 같은 함수여야
 * 서버가 내려준 경로와 화면이 계산한 경로가 어긋나지 않는다.
 */
export function groupPathOfUser<T extends GroupNode & { name: string }>(
  groups: T[],
  memberships: GroupMembership[],
  userId: string,
): string[] {
  const known = new Set(groups.map((g) => g.id));
  const paths = memberships
    .filter((m) => m.userId === userId && known.has(m.groupId))
    .map((m) => groupPathNames(groups, m.groupId))
    .filter((p) => p.length > 0);
  if (paths.length === 0) return [];
  // 말단 이름 기준 가나다순. 하나뿐인 정상적인 경우에는 정렬이 아무 일도 하지 않는다.
  paths.sort((a, b) => a[a.length - 1]!.localeCompare(b[b.length - 1]!, 'ko'));
  return paths[0]!;
}

/** 트리 체크박스의 세 상태. */
export type GroupCheckState = 'checked' | 'indeterminate' | 'unchecked';

/**
 * 트리 체크박스의 세 상태를 판정한다.
 *
 *  - picked 에 있고 모든 자손도 picked 에 있으면 checked
 *  - picked 에 있으나 빠진 자손이 있으면 indeterminate
 *  - picked 에 없으나 자손 중 하나라도 있으면 indeterminate
 *  - 아무것도 없으면 unchecked
 *
 * collectDescendantGroupIds 가 방문 기록으로 순환을 막으므로 이 함수도 순환 데이터에서 멈춘다.
 */
export function groupCheckState(
  groups: GroupNode[],
  picked: ReadonlySet<string>,
  groupId: string,
): GroupCheckState {
  if (!groups.some((g) => g.id === groupId)) return 'unchecked';

  // 자기 자신을 포함해 돌려주므로 자손만 따로 걸러 낸다.
  const descendants = [...collectDescendantGroupIds(groups, [groupId])].filter(
    (id) => id !== groupId,
  );
  const self = picked.has(groupId);
  const pickedDescendants = descendants.filter((id) => picked.has(id)).length;

  if (self) {
    return pickedDescendants === descendants.length ? 'checked' : 'indeterminate';
  }
  return pickedDescendants > 0 ? 'indeterminate' : 'unchecked';
}

/**
 * 주어진 그룹들에 **직접** 속한 사용자 id 를 중복 없이 돌려준다. 자손을 따라가지 않는다.
 *
 * expandGroupMembers 와 달리 자손을 자동으로 포함하지 않는 이유는, 화면이 상위를 체크할 때
 * 자손도 명시적으로 체크하기 때문이다. 이중으로 셀 필요가 없고, 무엇보다 **하위를 일부러
 * 풀었을 때 그 뜻이 그대로 반영되어야** 한다.
 *
 * 반환 순서는 expandGroupMembers 와 같이 memberships 에 들어 있던 순서를 따른다. 화면 표시
 * 순서를 안정적으로 두기 위함이다.
 */
export function directMembersOf(
  memberships: GroupMembership[],
  groupIds: readonly string[],
): string[] {
  if (groupIds.length === 0) return [];
  const targets = new Set(groupIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of memberships) {
    if (!targets.has(m.groupId)) continue;
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    out.push(m.userId);
  }
  return out;
}
