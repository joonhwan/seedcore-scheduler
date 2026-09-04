/**
 * 그룹 소속이 바뀐 뒤 여는 "프로젝트 참여 동기화" 대화상자에 넘길 목록을 만든다.
 *
 * 핵심은 **프로젝트마다 대상 인원을 따로 들고 다니는 것**이다. 예전에는 대화상자가 대상
 * 인원 목록 하나만 받아 고른 프로젝트마다 그 전원에게 요청을 보냈다. 그래서 여러 사람을
 * 한꺼번에 옮길 때, 이전 그룹과 아무 관계 없이 그 프로젝트에 직접 참여하던 사람까지 함께
 * 빠졌다. 여기서 프로젝트별로 "실제로 그 그룹을 통해 얽힌 사람"만 추려 두면 그 일이 없다.
 */
import type { GroupProjectCoverage } from '@sam/shared';
import { fetchProjectManagers } from './members';

/** 동기화 대상 한 명. 실패를 알릴 때 이름이 필요하므로 표시 이름까지 함께 든다. */
export interface SyncUser {
  id: string;
  displayName: string;
}

/** 프로젝트 하나에 실제로 넣거나 뺄 사람들. */
export interface SyncTarget {
  projectId: string;
  name: string;
  users: SyncUser[];
  /**
   * 고를 수 없는 이유. null 이면 고를 수 있다.
   * 서버가 어차피 거절할 것을 미리 알아낸 자리이며(대표적으로 마지막 MANAGER),
   * 화면은 이 항목의 체크를 막아 "적용했더니 일부만 반영"되는 상황 자체를 없앤다.
   */
  blockedReason: string | null;
}

/** 넣기 쪽. 새 소속 하나가 참여 중인 프로젝트라 집계를 그대로 보여 준다. */
export interface AddSide {
  groupName: string;
  targets: Array<
    SyncTarget & {
      groupMemberCount: number;
      participatingCount: number;
    }
  >;
}

/**
 * 빼기 쪽. 이전 소속은 여럿일 수 있어서 그룹 이름도 여럿이다.
 * (소속을 옮기면 서버가 대상 그룹 밖의 소속을 **모두** 지우므로, 첫 번째 그룹만 다루면
 * 나머지 그룹으로 얽힌 프로젝트 참여가 아무 안내 없이 남는다.)
 */
export interface RemoveSide {
  groupNames: string[];
  targets: SyncTarget[];
}

/**
 * 새 소속이 참여 중인 프로젝트 목록을 넣기 쪽으로 만든다.
 *
 * 프로젝트마다 `missingUserIds`(그 프로젝트에 참여하지 **않는** 사람)에 든 사람만 넣는다.
 * 이미 참여 중인 사람을 빼지 않으면, 이전 소속과 새 소속이 같은 프로젝트에 참여할 때 그
 * 프로젝트가 빼기 목록과 넣기 목록에 동시에 뜬다. 실제로 넣을 사람이 없으면 그 프로젝트를
 * 목록에서 뺀다. 넣을 것이 하나도 없으면 undefined 를 준다.
 */
export function buildAddSide(
  groupName: string,
  coverage: GroupProjectCoverage[],
  users: SyncUser[],
): AddSide | undefined {
  const targets: AddSide['targets'] = [];
  for (const c of coverage) {
    const missing = users.filter((u) => c.missingUserIds.includes(u.id));
    if (missing.length === 0) continue;
    targets.push({
      projectId: c.projectId,
      name: c.name,
      groupMemberCount: c.groupMemberCount,
      participatingCount: c.participatingCount,
      users: missing,
      blockedReason: null,
    });
  }
  if (targets.length === 0) return undefined;
  return { groupName, targets };
}

/**
 * 이전 소속 여러 곳에서 빠지는 인원을 프로젝트 기준으로 합친다.
 *
 * 프로젝트마다 `missingUserIds`(그 프로젝트에 참여하지 **않는** 사람)로 걸러, 실제로 뺄
 * 사람이 남는 프로젝트만 목록에 올린다. 그러지 않으면 DELETE 가 404 NOT_A_MEMBER 로
 * 막다른 길에 빠진다. 뺄 것이 하나도 없으면 undefined 를 준다.
 */
export function buildRemoveSide(
  parts: Array<{ groupName: string; coverage: GroupProjectCoverage[]; users: SyncUser[] }>,
): RemoveSide | undefined {
  const byProject = new Map<string, SyncTarget>();
  const groupNames: string[] = [];

  for (const part of parts) {
    let contributed = false;
    for (const c of part.coverage) {
      const users = part.users.filter((u) => !c.missingUserIds.includes(u.id));
      if (users.length === 0) continue;
      contributed = true;
      const existing = byProject.get(c.projectId);
      if (!existing) {
        byProject.set(c.projectId, {
          projectId: c.projectId,
          name: c.name,
          users: [...users],
          blockedReason: null,
        });
        continue;
      }
      // 같은 프로젝트가 이전 그룹 둘 이상에 걸릴 수 있다. 사람은 합집합으로 모은다.
      const seen = new Set(existing.users.map((u) => u.id));
      for (const u of users) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        existing.users.push(u);
      }
    }
    if (contributed && !groupNames.includes(part.groupName)) groupNames.push(part.groupName);
  }

  const targets = [...byProject.values()];
  if (targets.length === 0) return undefined;
  return { groupNames, targets };
}

/**
 * 서버가 거절할 것이 뻔한 항목에 이유를 달아 고를 수 없게 만든다.
 *
 * 지금 막는 것은 한 가지다. 그 프로젝트의 MANAGER 가 모두 이번 대상에 들어 있으면, 마지막
 * 한 명에서 서버가 LAST_MANAGER 로 거절한다. 눌러 보고 나서야 알면 일부만 반영된 채로
 * 끝나므로, 누르기 전에 막고 이유를 보여 준다.
 *
 * `managersByProject` 에 없는 프로젝트는 판단하지 않는다(조회하지 못한 경우). 막지 않고
 * 두었다가 실제 응답으로 처리하는 편이, 멀쩡한 항목을 잘못 막는 것보다 낫다.
 */
export function markBlockedTargets(
  side: RemoveSide,
  managersByProject: Map<string, string[]>,
): RemoveSide {
  return {
    groupNames: side.groupNames,
    targets: side.targets.map((t) => {
      const managers = managersByProject.get(t.projectId);
      if (!managers) return t;
      const leavingIds = new Set(t.users.map((u) => u.id));
      const leaving = managers.filter((id) => leavingIds.has(id));
      const staying = managers.filter((id) => !leavingIds.has(id));
      if (leaving.length === 0 || staying.length > 0) return t;
      return {
        ...t,
        blockedReason: '이 프로젝트에 남는 MANAGER 가 없어 해제할 수 없습니다.',
      };
    }),
  };
}

/**
 * 빼기 목록의 각 프로젝트에서 MANAGER 구성을 읽어, 막아야 할 항목에 이유를 달아 돌려준다.
 *
 * 조회가 실패하면 원본을 그대로 준다. 미리 막는 것은 편의 장치일 뿐이고, 실제 판단은 서버가
 * 하므로 여기서 실패했다고 동기화 안내 자체를 못 열게 할 이유가 없다.
 */
export async function annotateBlockedTargets(
  side: RemoveSide | undefined,
): Promise<RemoveSide | undefined> {
  if (!side) return undefined;
  try {
    const managers = await fetchProjectManagers(side.targets.map((t) => t.projectId));
    return markBlockedTargets(side, managers);
  } catch {
    return side;
  }
}

/** 두 쪽에 등장하는 모든 사용자 id. 대화상자가 조회 무효화 범위를 정하는 데 쓴다. */
export function syncUserIds(sides: Array<AddSide | RemoveSide | undefined>): string[] {
  const out = new Set<string>();
  for (const side of sides) {
    if (!side) continue;
    for (const t of side.targets) {
      for (const u of t.users) out.add(u.id);
    }
  }
  return [...out];
}
