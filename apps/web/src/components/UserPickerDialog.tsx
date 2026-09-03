import { useMemo, useState } from 'react';
import type { UserGroupItem } from '@sam/shared';
import { groupPathNames } from '@sam/shared';
import { useUsers } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';

/**
 * 그룹에 넣을 인원을 여러 명 고른다.
 * 이미 다른 그룹에 속한 사람은 행에 현재 소속을 함께 적어, 확인 창이 뜨기 전에 미리 알 수 있게 한다.
 */
export default function UserPickerDialog({
  title,
  excludeUserIds,
  membershipByUser,
  groups,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  /** 이미 이 그룹 소속이라 고를 필요가 없는 사람. */
  excludeUserIds: Set<string>;
  /** userId → 현재 소속 그룹 id. 소속이 없으면 항목이 없다. */
  membershipByUser: Map<string, string>;
  groups: UserGroupItem[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (userIds: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const users = useUsers({ status: 'active' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (users.data ?? []).filter((u) => !excludeUserIds.has(u.id));
    if (!q) return all;
    return all.filter(
      (u) =>
        u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
    );
  }, [users.data, excludeUserIds, query]);

  function toggle(userId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">{title}</h2>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="username / 이름 검색"
          className="mt-3 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />

        <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-100 dark:border-slate-800">
          {users.isLoading && <p className="p-3 text-sm text-slate-500">로딩…</p>}
          {users.isError && (
            <p className="p-3 text-sm text-rose-600">{apiErrorMessage(users.error)}</p>
          )}
          {users.data && filtered.length === 0 && (
            <p className="p-3 text-sm text-slate-500">고를 수 있는 사용자가 없습니다.</p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => {
              const currentGroupId = membershipByUser.get(u.id);
              const path =
                currentGroupId !== undefined
                  ? groupPathNames(groups, currentGroupId).join(' › ')
                  : null;
              return (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={picked.has(u.id)}
                      onChange={() => toggle(u.id)}
                    />
                    <span className="text-sm">
                      {u.displayName}{' '}
                      <span className="text-xs text-slate-500">@{u.username}</span>
                      {path !== null && (
                        <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          현재 {path}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

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
            disabled={picked.size === 0 || busy}
            onClick={() => onConfirm([...picked])}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? '처리 중…' : `${picked.size}명 추가`}
          </button>
        </div>
      </div>
    </div>
  );
}
