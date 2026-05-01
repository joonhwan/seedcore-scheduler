import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { UserListItem } from '@sam/shared';
import { useMe } from '../lib/auth';
import {
  useResetPassword,
  useUnlockUser,
  useUpdateUser,
  useUsers,
  type UserListStatus,
} from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import UserCreateDialog from '../components/UserCreateDialog';
import TempPasswordDialog from '../components/TempPasswordDialog';

export default function AdminUsersPage() {
  const me = useMe();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<UserListStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [tempPw, setTempPw] = useState<{ displayName: string; password: string } | null>(
    null,
  );

  const users = useUsers({ query, status });

  if (me.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.globalRole !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-600">ADMIN 권한이 필요합니다.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 프로젝트 목록
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link to="/" className="text-xs text-slate-500 hover:underline">
        ← 프로젝트 목록
      </Link>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-xl font-bold">사용자 관리</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + 사용자 추가
        </button>
      </div>

      <section className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="username / 이름 검색"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">상태</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as UserListStatus)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="all">전체</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
        </label>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
        {users.isLoading && <p className="p-4 text-sm text-slate-500">로딩…</p>}
        {users.isError && (
          <p className="p-4 text-sm text-rose-600">{apiErrorMessage(users.error)}</p>
        )}
        {users.data && users.data.length === 0 && (
          <p className="p-4 text-sm text-slate-500">조건에 맞는 사용자가 없습니다.</p>
        )}
        {users.data && users.data.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.data.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === me.data!.id}
                onTempPassword={(pw) =>
                  setTempPw({ displayName: u.displayName, password: pw })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {createOpen && (
        <UserCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            /* useCreateUser onSuccess 가 invalidate 처리 */
          }}
        />
      )}

      {tempPw && (
        <TempPasswordDialog
          displayName={tempPw.displayName}
          temporaryPassword={tempPw.password}
          onClose={() => setTempPw(null)}
        />
      )}
    </main>
  );
}

function UserRow({
  user,
  isSelf,
  onTempPassword,
}: {
  user: UserListItem;
  isSelf: boolean;
  onTempPassword: (pw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(user.displayName);
  const update = useUpdateUser();
  const reset = useResetPassword();
  const unlock = useUnlockUser();

  const isLocked =
    user.lockedUntil !== null && new Date(user.lockedUntil).getTime() > Date.now();

  async function onSaveName() {
    const next = draftName.trim();
    if (next.length === 0 || next === user.displayName) {
      setEditing(false);
      setDraftName(user.displayName);
      return;
    }
    try {
      await update.mutateAsync({ id: user.id, patch: { displayName: next } });
      toast.success('표시 이름이 변경되었습니다.');
      setEditing(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setDraftName(user.displayName);
    }
  }

  async function onToggleActive() {
    const next = !user.isActive;
    const verb = next ? '활성화' : '비활성화';
    const ok = window.confirm(`"${user.displayName}" 을(를) ${verb} 하시겠습니까?`);
    if (!ok) return;
    try {
      await update.mutateAsync({ id: user.id, patch: { isActive: next } });
      toast.success(`${verb} 되었습니다.`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onResetPassword() {
    const ok = window.confirm(
      `"${user.displayName}" 의 비밀번호를 리셋하시겠습니까?\n임시 비밀번호가 발급되며, 모든 기존 세션이 폐기됩니다.`,
    );
    if (!ok) return;
    try {
      const result = await reset.mutateAsync(user.id);
      onTempPassword(result.temporaryPassword);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onUnlock() {
    try {
      await unlock.mutateAsync(user.id);
      toast.success('잠금이 해제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const busy = update.isPending || reset.isPending || unlock.isPending;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={onSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveName();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setDraftName(user.displayName);
                }
              }}
              autoFocus
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-medium hover:underline"
              title="클릭하여 표시 이름 편집"
            >
              {user.displayName}
            </button>
          )}
          <span className="text-xs text-slate-500">@{user.username}</span>
          {user.globalRole === 'ADMIN' && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              ADMIN
            </span>
          )}
          {!user.isActive && (
            <span className="rounded border border-slate-400 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
              비활성
            </span>
          )}
          {isLocked && (
            <span className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
              잠김
            </span>
          )}
          {user.passwordMustChange && (
            <span className="rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
              비번변경필요
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          마지막 로그인: {user.lastLoginAt ? formatDate(user.lastLoginAt) : '없음'}
          {' · '}
          실패횟수: {user.failedLoginCount}
          {' · '}
          생성: {formatDate(user.createdAt)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isLocked && (
          <button
            type="button"
            onClick={onUnlock}
            disabled={busy}
            className="rounded border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            잠금 해제
          </button>
        )}
        <button
          type="button"
          onClick={onResetPassword}
          disabled={busy}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          비번 리셋
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          disabled={busy || isSelf}
          title={isSelf ? '자기 자신은 토글할 수 없습니다.' : undefined}
          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
            user.isActive
              ? 'border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950'
              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950'
          }`}
        >
          {user.isActive ? '비활성화' : '활성화'}
        </button>
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
