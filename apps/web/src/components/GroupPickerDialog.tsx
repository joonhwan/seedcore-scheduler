import { useMemo, useState } from 'react';
import { collectDescendantGroupIds, directMembersOf, groupCheckState } from '@sam/shared';
import { useGroupTree } from '../lib/groups';
import { useUsers } from '../lib/users';
import { flattenGroupTree } from '../lib/groupTreeView';
import { apiErrorMessage } from '../lib/errors';

/**
 * 그룹을 여러 개 골라 그 인원을 명단에 담는다.
 *
 * 체크박스는 세 상태를 가진다. 상위를 체크하면 자손도 함께 체크되고, 하위 하나를 풀면 상위가
 * 반쯤 체크된 모양이 된다. 반쯤 체크된 것을 클릭하면 다시 자손 전부가 체크된다.
 *
 * 담기는 인원은 **체크된 그룹들의 직속 인원 합집합**(directMembersOf)이다. 자손까지 훑는
 * expandGroupMembers 와 일부러 다른데, 상위를 체크할 때 자손도 명시적으로 체크되므로 이중으로
 * 셀 필요가 없고 무엇보다 **하위를 일부러 풀었을 때 그 뜻이 그대로 반영되어야** 하기 때문이다.
 * (expandGroupMembers 는 그룹 목록의 누계 인원수와 집계 조회에서 계속 쓰인다. 거기서는 자손
 * 포함이 옳다.)
 * 반쯤 체크된 상위 그룹의 직속 인원은 포함된다(상위 자신이 picked 에 남아 있다).
 *
 * 미리보기 숫자와 onPick 이 넘기는 값은 같은 함수에서 나온다. 다른 방법으로 세면 화면에 보여
 * 준 숫자와 실제로 들어가는 인원이 어긋난다.
 *
 * directMembersOf 는 소속 전원(비활성 포함)을 돌려주는데, 이 명단을 실제로 담는
 * MemberDraftEditor.addFromGroups 는 useUsers({ status: 'active' }) 로 찾은 사람만 담고
 * 나머지는 조용히 버린다. 그러면 여기 보여 준 숫자보다 실제로 담기는 인원이 적어지므로,
 * **활성 사용자와의 교집합을 미리 내서** 미리보기 숫자와 onPick 값이 정의상 같아지게 한다.
 */
export default function GroupPickerDialog({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (userIds: string[]) => void;
}) {
  const tree = useGroupTree();
  const users = useUsers({ status: 'active' });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const rows = useMemo(() => flattenGroupTree(tree.data?.groups ?? []), [tree.data?.groups]);

  // 그룹 수가 수십 개 규모라 매번 다시 만들어도 무리가 없지만, 토글·행 렌더링·인원 계산이
  // 모두 이 형태를 쓰므로 목록 밖에서 한 번만 만들어 재사용한다.
  const nodes = useMemo(
    () => (tree.data?.groups ?? []).map((g) => ({ id: g.id, parentId: g.parentId })),
    [tree.data?.groups],
  );

  const expanded = useMemo(() => {
    if (!tree.data) return [];
    return directMembersOf(tree.data.memberships, [...picked]);
  }, [tree.data, picked]);

  const activeIds = useMemo(() => new Set((users.data ?? []).map((u) => u.id)), [users.data]);

  const userIds = useMemo(() => expanded.filter((id) => activeIds.has(id)), [expanded, activeIds]);

  const inactiveCount = expanded.length - userIds.length;

  /**
   * 체크와 반쯤 체크는 모두 "넣기" 다. 자기 자신과 모든 자손을 picked 에 넣는다.
   * 완전히 체크된 것만 "빼기" 이며 자기 자신과 모든 자손을 뺀다.
   */
  function toggle(groupId: string) {
    if (!tree.data) return;
    // 자기 자신을 포함해 돌려준다.
    const family = collectDescendantGroupIds(nodes, [groupId]);
    const state = groupCheckState(nodes, picked, groupId);

    setPicked((prev) => {
      const next = new Set(prev);
      if (state === 'checked') {
        for (const id of family) next.delete(id);
      } else {
        for (const id of family) next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">그룹으로 담기</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          상위 그룹을 고르면 하위 그룹까지 함께 선택됩니다. 필요 없는 하위 그룹은 그 체크만 풀면
          되고, 그때 상위 그룹은 반쯤 체크된 상태로 바뀝니다. 담긴 뒤에는 명단에서 사람마다 역할을
          바꾸거나 뺄 수 있습니다.
        </p>

        <div className="mt-3 max-h-72 overflow-auto rounded border border-slate-100 dark:border-slate-800">
          {tree.isLoading && <p className="p-3 text-sm text-slate-500">로딩…</p>}
          {tree.isError && (
            <p className="p-3 text-sm text-rose-600">{apiErrorMessage(tree.error)}</p>
          )}
          {tree.data && rows.length === 0 && (
            <p className="p-3 text-sm text-slate-500">
              아직 만들어진 그룹이 없습니다. 관리자 모드의 그룹 관리에서 먼저 만드십시오.
            </p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(({ group, depth }) => {
              const state = groupCheckState(nodes, picked, group.id);
              return (
                <li key={group.id}>
                  <label
                    className="flex cursor-pointer items-center gap-2 py-2 pr-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    style={{ paddingLeft: `${12 + depth * 12}px` }}
                  >
                    <input
                      type="checkbox"
                      checked={state === 'checked'}
                      // indeterminate 는 어트리뷰트가 아니라 DOM 프로퍼티라 ref 로만 설정할 수 있다.
                      ref={(el) => {
                        if (el) el.indeterminate = state === 'indeterminate';
                      }}
                      onChange={() => toggle(group.id)}
                    />
                    <span>
                      {group.name}
                      <span className="ml-2 text-xs text-slate-500">
                        {group.totalMemberCount}명
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          선택한 그룹 인원 {userIds.length}명
        </p>
        {inactiveCount > 0 && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            비활성 사용자 {inactiveCount}명은 제외됩니다.
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            disabled={userIds.length === 0}
            onClick={() => onPick(userIds)}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            명단에 담기
          </button>
        </div>
      </div>
    </div>
  );
}
