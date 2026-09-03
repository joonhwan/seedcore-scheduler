import { useMemo, useState } from 'react';
import { expandGroupMembers } from '@sam/shared';
import { useGroupTree } from '../lib/groups';
import { flattenGroupTree } from '../lib/groupTreeView';
import { apiErrorMessage } from '../lib/errors';

/**
 * 그룹을 여러 개 골라 그 인원(자손 포함)을 명단에 담는다.
 *
 * 담기 전에 "선택한 그룹 인원 N명" 을 미리 보여 주는데, 그 숫자는 서버의 일괄 추가가 쓰는 것과
 * **같은 expandGroupMembers 함수**로 계산한다. 다른 방법으로 세면 화면에 보여 준 숫자와 실제로
 * 들어가는 인원이 어긋난다.
 */
export default function GroupPickerDialog({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (userIds: string[]) => void;
}) {
  const tree = useGroupTree();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () => flattenGroupTree(tree.data?.groups ?? []),
    [tree.data?.groups],
  );

  const userIds = useMemo(() => {
    if (!tree.data) return [];
    const nodes = tree.data.groups.map((g) => ({ id: g.id, parentId: g.parentId }));
    return expandGroupMembers(nodes, tree.data.memberships, [...picked]);
  }, [tree.data, picked]);

  function toggle(groupId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">그룹으로 담기</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          상위 그룹을 고르면 하위 그룹 인원까지 함께 담깁니다. 담긴 뒤에는 명단에서 사람마다
          역할을 바꾸거나 뺄 수 있습니다.
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
            {rows.map(({ group, depth }) => (
              <li key={group.id}>
                <label
                  className="flex cursor-pointer items-center gap-2 py-2 pr-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  style={{ paddingLeft: `${12 + depth * 12}px` }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(group.id)}
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
            ))}
          </ul>
        </div>

        <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          선택한 그룹 인원 {userIds.length}명
        </p>

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
