import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateProjectDto } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useCreateProject } from '../lib/projects';
import { useUsers } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function ProjectNewPage() {
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerIds, setManagerIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const users = useUsers({ status: 'active' });
  const create = useCreateProject();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!users.data) return [];
    if (!q) return users.data;
    return users.data.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q),
    );
  }, [users.data, search]);

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  if (me.data?.globalRole !== 'ADMIN' || !adminMode) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">접근 권한 없음</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          이 페이지는 관리자 모드에서 ADMIN 사용자만 접근할 수 있습니다.
        </p>
      </main>
    );
  }

  function toggleManager(userId: string) {
    setManagerIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const ids = [...managerIds];
    const parsed = CreateProjectDto.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
      managerUserIds: ids,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }
    try {
      const project = await create.mutateAsync(parsed.data);
      toast.success('프로젝트가 생성되었습니다.');
      navigate(`/projects/${project.id}`, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">새 프로젝트</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">이름 *</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">설명</span>
          <textarea
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-semibold">MANAGER 지정 *</legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            최소 1명 이상의 MANAGER 가 필요합니다. ({managerIds.size}명 선택)
          </p>
          <input
            type="search"
            placeholder="사용자 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="mt-2 max-h-60 overflow-auto rounded border border-slate-100 dark:border-slate-800">
            {users.isLoading && (
              <p className="p-3 text-sm text-slate-500">사용자 목록 로딩…</p>
            )}
            {users.isError && (
              <p className="p-3 text-sm text-rose-600">
                {apiErrorMessage(users.error)}
              </p>
            )}
            {filtered.length === 0 && users.data && (
              <p className="p-3 text-sm text-slate-500">일치하는 사용자가 없습니다.</p>
            )}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={managerIds.has(u.id)}
                      onChange={() => toggleManager(u.id)}
                    />
                    <span className="text-sm">
                      {u.displayName}{' '}
                      <span className="text-xs text-slate-500">@{u.username}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </fieldset>

        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {create.isPending ? '생성 중…' : '생성'}
          </button>
        </div>
      </form>
    </main>
  );
}
