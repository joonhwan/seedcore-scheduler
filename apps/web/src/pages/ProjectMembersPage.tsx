import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AddMemberDto,
  type ProjectMemberItem,
  type ProjectRole,
} from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProject } from '../lib/projects';
import { useAddMember, useMembers, useRemoveMember } from '../lib/members';
import { useUsers } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function ProjectMembersPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const project = useProject(id);
  const members = useMembers(id);

  const isAdmin = me.data?.globalRole === 'ADMIN';
  const myRole = project.data?.myRole ?? null;
  const canManage = myRole === 'MANAGER' || (isAdmin && adminMode);

  if (project.isLoading || members.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (project.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-600">{apiErrorMessage(project.error)}</p>
        <Link to="/" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 프로젝트 목록
        </Link>
      </main>
    );
  }
  if (!project.data || !id) return null;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to={`/projects/${id}`} className="text-xs text-slate-500 hover:underline">
        ← {project.data.name}
      </Link>
      <h1 className="mt-1 text-xl font-bold">멤버 관리</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        프로젝트: <span className="font-medium">{project.data.name}</span>
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold">현재 멤버 ({members.data?.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {members.data?.map((m) => (
            <MemberRow key={m.userId} projectId={id} member={m} canManage={canManage} />
          ))}
          {members.data && members.data.length === 0 && (
            <li className="py-2 text-sm text-slate-500">등록된 멤버가 없습니다.</li>
          )}
        </ul>
      </section>

      {canManage && (
        <AddMemberSection
          projectId={id}
          existingIds={new Set(members.data?.map((m) => m.userId) ?? [])}
        />
      )}
    </main>
  );
}

function MemberRow({
  projectId,
  member,
  canManage,
}: {
  projectId: string;
  member: ProjectMemberItem;
  canManage: boolean;
}) {
  const remove = useRemoveMember(projectId);

  async function onRemove() {
    const ok = window.confirm(`"${member.displayName}" 을(를) 멤버에서 제거하시겠습니까?`);
    if (!ok) return;
    try {
      await remove.mutateAsync(member.userId);
      toast.success('멤버가 제거되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div>
        <span className="font-medium">{member.displayName}</span>{' '}
        <span className="text-xs text-slate-500">@{member.username}</span>
        <span
          className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
            member.role === 'MANAGER'
              ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
              : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {member.role}
        </span>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={onRemove}
          disabled={remove.isPending}
          className="text-xs text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
        >
          제거
        </button>
      )}
    </li>
  );
}

function AddMemberSection({
  projectId,
  existingIds,
}: {
  projectId: string;
  existingIds: Set<string>;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const [error, setError] = useState<string | null>(null);

  const users = useUsers({ status: 'active' });
  const add = useAddMember(projectId);

  const filtered = useMemo(() => {
    if (!users.data) return [];
    const q = search.trim().toLowerCase();
    return users.data.filter((u) => {
      if (existingIds.has(u.id)) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
      );
    });
  }, [users.data, search, existingIds]);

  async function onAdd(userId: string) {
    setError(null);
    const parsed = AddMemberDto.safeParse({ userId, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }
    try {
      await add.mutateAsync(parsed.data);
      toast.success('멤버가 추가되었습니다.');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">멤버 추가</h2>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="사용자 검색"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">역할</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="MEMBER">MEMBER</option>
            <option value="MANAGER">MANAGER</option>
          </select>
        </label>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-auto rounded border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
        {users.isLoading && (
          <li className="p-3 text-sm text-slate-500">로딩…</li>
        )}
        {users.isError && (
          <li className="p-3 text-sm text-rose-600">{apiErrorMessage(users.error)}</li>
        )}
        {filtered.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <span>
              {u.displayName}{' '}
              <span className="text-xs text-slate-500">@{u.username}</span>
            </span>
            <button
              type="button"
              onClick={() => onAdd(u.id)}
              disabled={add.isPending}
              className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              + 추가 ({role})
            </button>
          </li>
        ))}
        {users.data && filtered.length === 0 && (
          <li className="p-3 text-sm text-slate-500">추가 가능한 사용자가 없습니다.</li>
        )}
      </ul>
    </section>
  );
}
