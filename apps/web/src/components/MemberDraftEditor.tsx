import { useMemo, useState } from 'react';
import {
  countDraftRoles,
  mergeMemberDrafts,
  type MemberDraft,
  type ProjectRole,
} from '@sam/shared';
import { useUsers } from '../lib/users';
import { useGroupTree } from '../lib/groups';
import { groupPathMapOf } from '../lib/groupBadge';
import { apiErrorMessage } from '../lib/errors';
import GroupPickerDialog from './GroupPickerDialog';
import UserGroupBadge from './UserGroupBadge';

/**
 * 프로젝트 참여자 명단 편집기. 생성·복제·멤버 관리 세 화면이 함께 쓴다.
 *
 * 명단을 채우는 입력이 둘이다.
 *  - [그룹으로 담기]: 그룹을 골라 인원을 한 번 복사한다. 담긴 뒤로는 명단이 독립적이다.
 *  - 검색해서 담기: 검색 결과에서 개별로 고르거나 "결과 전체 선택" 으로 한꺼번에 담는다.
 *    전체 선택을 검색 결과 범위로 한정하는 것이 요청 3번의 취지다 (실수로 전 인원을 담는 것을 막음).
 */
export default function MemberDraftEditor({
  drafts,
  onChange,
  showInactiveWarning = false,
}: {
  drafts: MemberDraft[];
  onChange: (next: MemberDraft[]) => void;
  /** 복제 화면 전용. 비활성 사용자가 명단에 섞여 있음을 알리고 역할 선택을 막는다. */
  showInactiveWarning?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [groupOpen, setGroupOpen] = useState(false);
  const users = useUsers({ status: 'active' });
  const tree = useGroupTree();
  const groupPaths = useMemo(
    () =>
      groupPathMapOf(tree.data, [
        ...drafts.map((d) => d.userId),
        ...(users.data ?? []).map((u) => u.id),
      ]),
    [tree.data, drafts, users.data],
  );

  const counts = countDraftRoles(drafts);
  const inDraft = useMemo(() => new Set(drafts.map((d) => d.userId)), [drafts]);

  /** 검색 결과. 이미 명단에 있는 사람은 후보에서 뺀다. */
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = (users.data ?? []).filter((u) => !inDraft.has(u.id));
    if (!q) return all;
    return all.filter(
      (u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
    );
  }, [users.data, inDraft, search]);

  /**
   * 그룹으로 담겨 이미 명단에 들어간 사람이 checked 에 남아 있으면 "선택한 N명 담기" 의 숫자가
   * 화면에 보이는 체크 수보다 커진다. 그 행은 후보 목록에서 사라져 사용자가 체크를 풀 수도 없다.
   * 그래서 읽는 시점에 걸러 둔다.
   */
  const effectiveChecked = useMemo(
    () => new Set([...checked].filter((id) => !inDraft.has(id))),
    [checked, inDraft],
  );

  const allChecked = candidates.length > 0 && candidates.every((u) => effectiveChecked.has(u.id));

  function setRole(userId: string, role: ProjectRole | null) {
    onChange(drafts.map((d) => (d.userId === userId ? { ...d, role } : d)));
  }

  function toggleCandidate(userId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  /** 검색 결과 전체를 켜거나 끈다. 검색어 밖의 선택은 건드리지 않는다. */
  function toggleAllInResults() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) for (const u of candidates) next.delete(u.id);
      else for (const u of candidates) next.add(u.id);
      return next;
    });
  }

  function addChecked() {
    const incoming: MemberDraft[] = (users.data ?? [])
      .filter((u) => effectiveChecked.has(u.id))
      .map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        username: u.username,
        role: 'MEMBER' as const,
        inactive: false,
      }));
    onChange(mergeMemberDrafts(drafts, incoming));
    setChecked(new Set());
  }

  /** 그룹으로 담긴 인원의 기본 역할은 MEMBER 다 (확정명세 §2-나). */
  function addFromGroups(userIds: string[]) {
    const byId = new Map((users.data ?? []).map((u) => [u.id, u]));
    const incoming: MemberDraft[] = userIds
      .map((id) => byId.get(id))
      .filter((u): u is NonNullable<typeof u> => u !== undefined)
      .map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        username: u.username,
        role: 'MEMBER' as const,
        inactive: false,
      }));
    onChange(mergeMemberDrafts(drafts, incoming));
    setGroupOpen(false);
  }

  return (
    <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-sm font-semibold">참여자 명단 *</legend>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        총 {counts.total}명 (MANAGER {counts.managers} · MEMBER {counts.members}). MANAGER 는 최소
        1명이 필요합니다.
      </p>

      <button
        type="button"
        onClick={() => setGroupOpen(true)}
        className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
      >
        그룹으로 담기
      </button>

      <div className="mt-3 rounded border border-slate-100 p-2 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="사용자 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={allChecked}
              disabled={candidates.length === 0}
              onChange={toggleAllInResults}
            />
            결과 전체 선택
          </label>
        </div>

        <div className="mt-2 max-h-48 overflow-auto">
          {users.isLoading && <p className="p-2 text-sm text-slate-500">로딩…</p>}
          {users.isError && (
            <p className="p-2 text-sm text-rose-600">{apiErrorMessage(users.error)}</p>
          )}
          {users.data && candidates.length === 0 && (
            <p className="p-2 text-sm text-slate-500">담을 수 있는 사용자가 없습니다.</p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {candidates.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={effectiveChecked.has(u.id)}
                    onChange={() => toggleCandidate(u.id)}
                  />
                  <span className="text-sm">
                    {u.displayName} <span className="text-xs text-slate-500">@{u.username}</span>{' '}
                    <UserGroupBadge path={groupPaths.get(u.id) ?? []} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={effectiveChecked.size === 0}
            onClick={addChecked}
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            선택한 {effectiveChecked.size}명 담기
          </button>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {drafts.map((d) => (
          <li key={d.userId} className="flex flex-wrap items-center gap-3 py-2">
            <span className="flex-1 text-sm">
              {d.displayName} <span className="text-xs text-slate-500">@{d.username}</span>{' '}
              <UserGroupBadge path={groupPaths.get(d.userId) ?? []} />
              {showInactiveWarning && d.inactive && (
                <span className="block text-xs text-amber-600 dark:text-amber-400">
                  비활성 사용자 — 복제 대상에서 제외됩니다
                </span>
              )}
            </span>
            <div className="flex gap-3 text-xs">
              {(['MANAGER', 'MEMBER'] as const).map((role) => (
                <label
                  key={role}
                  className={`flex items-center gap-1 ${d.inactive ? 'opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={`role-${d.userId}`}
                    checked={d.role === role}
                    disabled={d.inactive}
                    onChange={() => setRole(d.userId, role)}
                  />
                  {role}
                </label>
              ))}
              <label className="flex items-center gap-1 text-slate-500">
                <input
                  type="radio"
                  name={`role-${d.userId}`}
                  checked={d.role === null}
                  onChange={() => setRole(d.userId, null)}
                />
                제외
              </label>
            </div>
          </li>
        ))}
        {drafts.length === 0 && (
          <li className="py-2 text-sm text-slate-500">
            아직 담은 사람이 없습니다. 그룹으로 담거나 검색해서 고르십시오.
          </li>
        )}
      </ul>

      {groupOpen && (
        <GroupPickerDialog onCancel={() => setGroupOpen(false)} onPick={addFromGroups} />
      )}
    </fieldset>
  );
}
