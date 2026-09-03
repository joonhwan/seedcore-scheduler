/**
 * useGroupTree() 로 받은 그룹·소속에서 사용자별 소속 경로 맵을 만든다.
 *
 * 세 화면(사용자 관리 목록, 명단 편집기의 후보 목록과 명단 목록)이 같은 일을 하므로 여기로
 * 모았다. 경로를 만드는 것은 서버와 같은 groupPathOfUser 함수다.
 *
 * tree 가 undefined 인 경우(아직 도착하지 않았거나 조회가 실패한 경우)에는 모두 빈 배열을
 * 돌려준다. **그룹은 곁다리 정보이므로 그것을 못 받았다고 사용자 목록 자체가 오류로 보이면
 * 안 된다.**
 */
import { groupPathOfUser, type UserGroupTree } from '@sam/shared';

export function groupPathMapOf(
  tree: UserGroupTree | undefined,
  userIds: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const userId of userIds) {
    out.set(userId, tree ? groupPathOfUser(tree.groups, tree.memberships, userId) : []);
  }
  return out;
}
