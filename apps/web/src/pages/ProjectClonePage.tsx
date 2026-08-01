import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CloneProjectDto,
  buildRemapPlan,
  findDateSpan,
  remapDatePair,
  toEpochDay,
  type CloneDateMode,
  type ProjectRole,
} from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProject, useCloneProject } from '../lib/projects';
import { useMembers } from '../lib/members';
import { useNodes } from '../lib/nodes';
import { useUsers } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/** 승계 대상 한 명. role 이 null 이면 새 프로젝트에서 제외한다. */
interface MemberDraft {
  userId: string;
  displayName: string;
  username: string;
  role: ProjectRole | null;
}

export default function ProjectClonePage() {
  const { id: sourceId } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const navigate = useNavigate();

  const source = useProject(sourceId);
  const sourceMembers = useMembers(sourceId);
  const sourceNodes = useNodes(sourceId);
  const users = useUsers({ status: 'active' });
  const clone = useCloneProject(sourceId ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dateMode, setDateMode] = useState<CloneDateMode>('KEEP');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [drafts, setDrafts] = useState<MemberDraft[]>([]);
  const [draftsSeeded, setDraftsSeeded] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 원본 이름·설명을 한 번만 프리필한다. 이후 사용자가 고친 값을 덮지 않는다.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !source.data) return;
    setName(`${source.data.name} (복사)`);
    setDescription(source.data.description ?? '');
    setPrefilled(true);
  }, [source.data, prefilled]);

  // 원본 멤버를 역할 그대로 프리필한다.
  useEffect(() => {
    if (draftsSeeded || !sourceMembers.data) return;
    setDrafts(
      sourceMembers.data.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        username: m.username,
        role: m.role,
      })),
    );
    setDraftsSeeded(true);
  }, [sourceMembers.data, draftsSeeded]);

  // 원본 일정 span. ITEM 만 본다 — GROUP 은 DB 에 날짜가 비어 있다.
  const span = useMemo(() => {
    if (!sourceNodes.data) return null;
    return findDateSpan(
      sourceNodes.data
        .filter((n) => n.kind === 'ITEM')
        .map((n) => ({ startAt: n.startAt, endAt: n.endAt })),
    );
  }, [sourceNodes.data]);

  const spanDays = span ? toEpochDay(span.end) - toEpochDay(span.start) + 1 : 0;

  // API 가 실제 복제에서 쓰는 것과 같은 함수로 계산한 미리보기.
  const preview = useMemo(() => {
    if (dateMode === 'KEEP') return span;
    if (!span || !newStartDate) return null;
    if (dateMode === 'FIT' && !newEndDate) return null;
    if (dateMode === 'FIT' && newEndDate < newStartDate) return null;
    try {
      const plan = buildRemapPlan(span, { mode: dateMode, newStartDate, newEndDate });
      const out = remapDatePair({ startAt: span.start, endAt: span.end }, plan);
      if (!out.startAt || !out.endAt) return null;
      return { start: out.startAt, end: out.endAt };
    } catch {
      return null;
    }
  }, [dateMode, span, newStartDate, newEndDate]);

  const managerCount = drafts.filter((d) => d.role === 'MANAGER').length;

  // 원본 멤버가 아닌 사용자만 추가 후보로 보여준다.
  const addCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !users.data) return [];
    const taken = new Set(drafts.map((d) => d.userId));
    return users.data
      .filter((u) => !taken.has(u.id))
      .filter(
        (u) =>
          u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [users.data, drafts, search]);

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

  function setRole(userId: string, role: ProjectRole | null) {
    setDrafts((prev) => prev.map((d) => (d.userId === userId ? { ...d, role } : d)));
  }

  function addUser(u: { id: string; displayName: string; username: string }) {
    setDrafts((prev) => [
      ...prev,
      { userId: u.id, displayName: u.displayName, username: u.username, role: 'MEMBER' },
    ]);
    setSearch('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sourceId) return;

    const parsed = CloneProjectDto.safeParse({
      name: name.trim(),
      description: description.trim() || null,
      dateMode,
      ...(dateMode !== 'KEEP' ? { newStartDate } : {}),
      ...(dateMode === 'FIT' ? { newEndDate } : {}),
      managerUserIds: drafts.filter((d) => d.role === 'MANAGER').map((d) => d.userId),
      memberUserIds: drafts.filter((d) => d.role === 'MEMBER').map((d) => d.userId),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }

    try {
      const result = await clone.mutateAsync(parsed.data);
      toast.success(`프로젝트가 복제되었습니다. (일정 ${result.nodeCount}개)`);
      navigate(`/projects/${result.project.id}`, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const inputCls =
    'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">프로젝트 복제</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        원본: {source.data?.name ?? '…'}
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">새 프로젝트 이름 *</span>
          <input
            className={inputCls}
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
            className={inputCls}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-semibold">일정 처리</legend>

          {sourceNodes.isLoading && (
            <p className="text-xs text-slate-500">원본 일정 확인 중…</p>
          )}
          {span && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              원본 일정: {span.start} ~ {span.end} ({spanDays}일)
            </p>
          )}
          {sourceNodes.data && !span && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              원본에 날짜가 지정된 일정이 없어 날짜를 옮길 수 없습니다. 원본 일정 유지만
              선택할 수 있습니다.
            </p>
          )}

          <div className="mt-3 space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'KEEP'}
                onChange={() => setDateMode('KEEP')}
              />
              <span>
                <span className="font-medium">원본 일정 그대로 유지</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  날짜를 손대지 않습니다.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'SHIFT'}
                disabled={!span}
                onChange={() => setDateMode('SHIFT')}
              />
              <span>
                <span className="font-medium">시작일만 지정해서 통째로 밀기</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  각 일정의 기간과 일정 사이 간격이 그대로 보존됩니다.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'FIT'}
                disabled={!span}
                onChange={() => setDateMode('FIT')}
              />
              <span>
                <span className="font-medium">새 기간에 맞춰 늘리거나 줄이기</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  전체 일정이 새 범위를 채우도록 비례 조정됩니다. 각 일정의 기간도 함께
                  늘거나 줄어듭니다.
                </span>
              </span>
            </label>
          </div>

          {dateMode !== 'KEEP' && (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="block text-sm">
                <span className="block text-slate-700 dark:text-slate-300">새 시작일 *</span>
                <input
                  className={inputCls}
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  required
                />
              </label>
              {dateMode === 'FIT' && (
                <label className="block text-sm">
                  <span className="block text-slate-700 dark:text-slate-300">새 종료일 *</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={newEndDate}
                    min={newStartDate || undefined}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    required
                  />
                </label>
              )}
            </div>
          )}

          {preview && (
            <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
              복제 후 일정: {preview.start} ~ {preview.end} (
              {toEpochDay(preview.end) - toEpochDay(preview.start) + 1}일)
            </p>
          )}
        </fieldset>

        <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-semibold">멤버 승계 *</legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            원본 멤버를 그대로 물려받습니다. 역할을 바꾸거나 제외할 수 있습니다. MANAGER 는
            최소 1명이 필요합니다. (현재 MANAGER {managerCount}명)
          </p>

          {sourceMembers.isLoading && (
            <p className="mt-2 text-sm text-slate-500">원본 멤버 로딩…</p>
          )}

          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {drafts.map((d) => (
              <li key={d.userId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1 text-sm">
                  {d.displayName}{' '}
                  <span className="text-xs text-slate-500">@{d.username}</span>
                </span>
                <div className="flex gap-3 text-xs">
                  {(['MANAGER', 'MEMBER'] as const).map((role) => (
                    <label key={role} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`role-${d.userId}`}
                        checked={d.role === role}
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
          </ul>

          <div className="mt-3">
            <input
              type="search"
              placeholder="사용자 검색해서 추가"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            {addCandidates.length > 0 && (
              <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {addCandidates.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addUser(u)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      + {u.displayName}{' '}
                      <span className="text-xs text-slate-500">@{u.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
            disabled={clone.isPending || managerCount === 0}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {clone.isPending ? '복제 중…' : '복제'}
          </button>
        </div>
      </form>
    </main>
  );
}
