/**
 * 프로젝트 참여자 명단(초안)을 다루는 순수 함수.
 *
 * 명단은 그룹에서 한 번 복사해 온 뒤로는 독립적으로 편집된다 (확정명세 ㉯ 의 명단 복사 방식).
 * 그래서 이미 명단에 있는 사람의 역할은 무슨 일이 있어도 보존한다 — 관리자가 개별로 MANAGER 로
 * 올려 둔 사람이 그룹을 다시 담았다고 MEMBER 로 되돌아가면 알아채기 어렵다.
 */
import type { ProjectRole } from './index';

/** 승계 대상 한 명. role 이 null 이면 이 프로젝트에서 제외한다. */
export interface MemberDraft {
  userId: string;
  displayName: string;
  username: string;
  role: ProjectRole | null;
  /** 활성 사용자 목록에 없는 사용자. 서버가 거부하므로 화면이 제외를 강제한다. */
  inactive: boolean;
}

/**
 * 명단에 인원을 합류시킨다.
 * 이미 있는 사람은 건드리지 않고, 새 사람만 뒤에 붙인다.
 */
export function mergeMemberDrafts(current: MemberDraft[], incoming: MemberDraft[]): MemberDraft[] {
  const seen = new Set(current.map((d) => d.userId));
  const out = [...current];
  for (const d of incoming) {
    if (seen.has(d.userId)) continue;
    seen.add(d.userId);
    out.push(d);
  }
  return out;
}

/** 명단 요약. 제외(null)한 사람은 총원에서 뺀다. */
export function countDraftRoles(drafts: MemberDraft[]): {
  total: number;
  managers: number;
  members: number;
} {
  let managers = 0;
  let members = 0;
  for (const d of drafts) {
    if (d.role === 'MANAGER') managers += 1;
    else if (d.role === 'MEMBER') members += 1;
  }
  return { total: managers + members, managers, members };
}
