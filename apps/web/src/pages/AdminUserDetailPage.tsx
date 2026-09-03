import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { groupPathNames, type ProjectRole, type UserListItem } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useUsers, useUpdateUser } from '../lib/users';
import { useGroupTree } from '../lib/groups';
import { useProjects } from '../lib/projects';
import {
  useAddUserProjects,
  useRemoveUserProject,
  useUpdateUserProjectRole,
  useUserGroups,
  useUserProjects,
} from '../lib/userProjects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  // 사용자 단건 조회 API 가 없으므로 목록에서 골라 쓴다. 150명 규모라 부담이 없다.
  const users = useUsers({ status: 'all' });
  const user = users.data?.find((u) => u.id === id) ?? null;

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
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
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/admin/users" className="text-xs text-slate-500 hover:underline">
        ← 사용자 관리
      </Link>

      {users.isLoading && <p className="mt-4 text-sm text-slate-500">로딩…</p>}
      {users.isError && (
        <p className="mt-4 text-sm text-rose-600">{apiErrorMessage(users.error)}</p>
      )}
      {users.data && !user && (
        <p className="mt-4 text-sm text-rose-600">사용자를 찾을 수 없습니다.</p>
      )}

      {user && id && (
        <>
          <AccountSection user={user} />
          <GroupSection userId={id} />
          <ProjectSection userId={id} />
        </>
      )}
    </main>
  );
}

function AccountSection({ user }: { user: UserListItem }) {
  const [draftName, setDraftName] = useState(user.displayName);
  const update = useUpdateUser();

  // 다른 관리자가 이 사용자의 표시 이름을 고치면 user prop 이 새 값으로 바뀐다. 내가 아직
  // 손대지 않았을 때만(touched === false) 입력창을 새 값으로 맞춘다. 그러지 않으면 저장
  // 버튼의 비활성 조건(draftName === user.displayName)이 저절로 풀리고, 그대로 저장하면
  // 화면에 남은 옛 값이 상대의 변경을 조용히 덮어쓴다.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setDraftName(user.displayName);
  }, [user.displayName, touched]);

  async function onSaveName() {
    const next = draftName.trim();
    if (next.length === 0 || next === user.displayName) return;
    try {
      await update.mutateAsync({ id: user.id, patch: { displayName: next } });
      toast.success('표시 이름이 변경되었습니다.');
      setTouched(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      // 입력값을 서버 값으로 되돌렸으므로 편집 표시도 함께 내린다. 이것이 없으면 한 번
      // 실패한 뒤로 이 필드가 외부 변경을 영구히 따라가지 않는다.
      setDraftName(user.displayName);
      setTouched(false);
    }
  }

  return (
    <>
      <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
        {user.displayName}
        <span className="text-sm font-normal text-slate-500">@{user.username}</span>
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
      </h1>

      <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold">계정</h2>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-300">표시 이름</span>
            <input
              type="text"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setTouched(true);
              }}
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={onSaveName}
            disabled={update.isPending || draftName.trim() === user.displayName}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            저장
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          비밀번호 리셋·활성 토글·잠금 해제는 사용자 관리 목록에서 처리하십시오.
        </p>
      </section>
    </>
  );
}

function GroupSection({ userId }: { userId: string }) {
  const myGroups = useUserGroups(userId);
  const tree = useGroupTree();

  const paths = useMemo(() => {
    const all = tree.data?.groups ?? [];
    return (myGroups.data ?? []).map((g) => groupPathNames(all, g.id).join(' › '));
  }, [myGroups.data, tree.data?.groups]);

  return (
    <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">소속 그룹</h2>
      {myGroups.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      {myGroups.data && myGroups.data.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          소속 없음. 그룹 관리 화면에서 그룹에 넣으십시오.
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {paths.map((p) => (
          <li key={p} className="text-sm">
            {p}
          </li>
        ))}
      </ul>
      <Link
        to="/admin/groups"
        className="mt-3 inline-block rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
      >
        그룹 관리로 이동
      </Link>
    </section>
  );
}

function ProjectSection({ userId }: { userId: string }) {
  const mine = useUserProjects(userId);
  const [addOpen, setAddOpen] = useState(false);
  const updateRole = useUpdateUserProjectRole(userId);
  const removeProject = useRemoveUserProject(userId);

  // 확인 창을 취소하면 상태가 바뀌지 않아 리렌더가 일어나지 않는다. 그러면 셀렉트에는 방금
  // 고른(거부된) 값이 그대로 남아 서버 상태와 어긋난다. 이 값을 올려 셀렉트를 다시 마운트해
  // value 로 되돌린다.
  const [cancelToken, setCancelToken] = useState(0);

  async function onRoleChange(projectId: string, name: string, role: ProjectRole) {
    const verb = role === 'MANAGER' ? 'MANAGER(매니저)로 승격' : 'MEMBER(일반 멤버)로 변경';
    const ok = window.confirm(`"${name}" 에서의 역할을 ${verb}하시겠습니까?`);
    if (!ok) {
      setCancelToken((n) => n + 1);
      return;
    }
    try {
      await updateRole.mutateAsync({ projectId, role });
      toast.success('역할이 변경되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onRemove(projectId: string, name: string) {
    const ok = window.confirm(`"${name}" 참여를 해제하시겠습니까?`);
    if (!ok) return;
    try {
      await removeProject.mutateAsync(projectId);
      toast.success('참여가 해제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          참여 프로젝트 {mine.data?.length ?? 0}건
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
        >
          + 프로젝트 일괄 추가
        </button>
      </div>

      {mine.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      {mine.isError && (
        <p className="mt-2 text-sm text-rose-600">{apiErrorMessage(mine.error)}</p>
      )}
      {mine.data && mine.data.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">참여 중인 프로젝트가 없습니다.</p>
      )}

      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {mine.data?.map((p) => (
          <li key={p.projectId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <Link to={`/projects/${p.projectId}`} className="flex-1 hover:underline">
              {p.name}
              {p.status === 'ARCHIVED' && (
                <span className="ml-2 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] text-slate-500">
                  보관됨
                </span>
              )}
            </Link>
            <select
              key={`${p.projectId}:${p.role}:${cancelToken}`}
              value={p.role}
              onChange={(e) => onRoleChange(p.projectId, p.name, e.target.value as ProjectRole)}
              disabled={updateRole.isPending}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="MANAGER">MANAGER</option>
              <option value="MEMBER">MEMBER</option>
            </select>
            <span className="text-xs text-slate-500">{p.addedAt.slice(0, 10)}</span>
            <button
              type="button"
              onClick={() => onRemove(p.projectId, p.name)}
              disabled={removeProject.isPending}
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
            >
              제외
            </button>
          </li>
        ))}
      </ul>

      {addOpen && (
        <AddProjectsDialog
          userId={userId}
          alreadyIn={new Set(mine.data?.map((p) => p.projectId) ?? [])}
          onClose={() => setAddOpen(false)}
        />
      )}
    </section>
  );
}

function AddProjectsDialog({
  userId,
  alreadyIn,
  onClose,
}: {
  userId: string;
  alreadyIn: Set<string>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const projects = useProjects();
  const add = useAddUserProjects(userId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = projects.data ?? [];
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects.data, query]);

  async function onConfirm() {
    try {
      const result = await add.mutateAsync({ projectIds: [...picked], role });
      toast.success(
        result.skipped > 0
          ? `${result.added}건 추가, ${result.skipped}건은 이미 참여 중이라 건너뛰었습니다.`
          : `${result.added}건에 추가되었습니다.`,
      );
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">프로젝트 일괄 추가</h2>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트 검색"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="MEMBER">MEMBER</option>
            <option value="MANAGER">MANAGER</option>
          </select>
        </div>

        <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-100 dark:border-slate-800">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((p) => {
              const taken = alreadyIn.has(p.id);
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-2 px-3 py-2 ${
                      taken ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={taken}
                      checked={picked.has(p.id)}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                    />
                    <span className="text-sm">
                      {p.name}
                      {taken && (
                        <span className="ml-2 text-xs text-slate-500">참여 중</span>
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
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={picked.size === 0 || add.isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {add.isPending ? '처리 중…' : `${picked.size}건 추가`}
          </button>
        </div>
      </div>
    </div>
  );
}
