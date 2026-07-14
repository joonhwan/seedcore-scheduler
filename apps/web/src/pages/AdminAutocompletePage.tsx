import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { AutocompleteTermDto } from '@sam/shared';
import { useMe } from '../lib/auth';
import {
  useAdminAutocompleteTerms,
  useCreateAutocompleteTerm,
  useUpdateAutocompleteTerm,
  useDeleteAutocompleteTerm,
  useSyncAutocompleteTerms,
} from '../lib/autocomplete';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function AdminAutocompletePage() {
  const me = useMe();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'ALL' | 'GROUP' | 'ITEM'>('ALL');
  const [type, setType] = useState<'ALL' | 'SYSTEM' | 'USER'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);

  const fetchOpts: { query?: string; kind?: 'GROUP' | 'ITEM'; isSystem?: boolean } = {};
  if (query) fetchOpts.query = query;
  if (kind !== 'ALL') fetchOpts.kind = kind;
  if (type !== 'ALL') fetchOpts.isSystem = type === 'SYSTEM';

  const terms = useAdminAutocompleteTerms(fetchOpts);

  const sync = useSyncAutocompleteTerms();

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

  async function handleSync() {
    const ok = window.confirm(
      '자동완성 단어 동기화를 실행하시겠습니까?\n현재 실제 일정에 존재하지 않는 사용자 입력 단어가 삭제되고, 누락된 일정 제목이 자동으로 수집됩니다.'
    );
    if (!ok) return;
    try {
      await sync.mutateAsync();
      toast.success('동기화가 완료되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">자동완성 관리</h1>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
            {terms.data?.length ?? 0}개 항목
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={sync.isPending}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            title="현재 DB의 실제 노드와 동기화"
          >
            {sync.isPending ? '동기화 중…' : '수동 동기화'}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            + 단어 추가
          </button>
        </div>
      </div>

      <section className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="단어(제목) 검색"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-400 shrink-0">일정 분류</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">전체</option>
              <option value="GROUP">그룹 (GROUP)</option>
              <option value="ITEM">작업 (ITEM)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-400 shrink-0">유형</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="ALL">전체</option>
              <option value="SYSTEM">초기 설정 (Admin)</option>
              <option value="USER">자동 수집 (User)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        {terms.isLoading && <p className="p-4 text-sm text-slate-500">로딩…</p>}
        {terms.isError && (
          <p className="p-4 text-sm text-rose-600">{apiErrorMessage(terms.error)}</p>
        )}
        {terms.data && terms.data.length === 0 && (
          <p className="p-4 text-sm text-slate-500">등록된 자동완성 단어가 없습니다.</p>
        )}
        {terms.data && terms.data.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {terms.data.map((term) => (
              <AutocompleteRow key={term.id} term={term} />
            ))}
          </ul>
        )}
      </section>

      {createOpen && (
        <CreateDialog onClose={() => setCreateOpen(false)} />
      )}
    </main>
  );
}

function AutocompleteRow({ term }: { term: AutocompleteTermDto }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(term.title);
  const update = useUpdateAutocompleteTerm();
  const remove = useDeleteAutocompleteTerm();

  async function handleSave() {
    const next = draftTitle.trim();
    if (next.length === 0 || next === term.title) {
      setEditing(false);
      setDraftTitle(term.title);
      return;
    }
    try {
      await update.mutateAsync({ id: term.id, patch: { title: next } });
      toast.success('단어가 수정되었습니다.');
      setEditing(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setDraftTitle(term.title);
    }
  }

  async function handleDelete() {
    const verb = term.isSystem ? '초기 단어' : '자동 수집 단어';
    const ok = window.confirm(`"${term.title}" (${verb}) 을(를) 삭제하시겠습니까?`);
    if (!ok) return;
    try {
      await remove.mutateAsync(term.id);
      toast.success('단어가 삭제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const busy = update.isPending || remove.isPending;

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setDraftTitle(term.title);
                }
              }}
              autoFocus
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-medium hover:underline text-slate-800 dark:text-slate-200"
              title="클릭하여 단어 편집"
            >
              {term.title}
            </button>
          )}

          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              term.kind === 'GROUP'
                ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                : 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800'
            }`}
          >
            {term.kind === 'GROUP' ? '그룹' : '작업'}
          </span>

          {term.isSystem ? (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              초기설정
            </span>
          ) : (
            <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              자동수집
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          최종 수정: {formatDate(term.updatedAt)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
        >
          편집
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="rounded border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'GROUP' | 'ITEM'>('ITEM');
  const create = useCreateAutocompleteTerm();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error('단어를 입력해주세요.');
      return;
    }
    try {
      await create.mutateAsync({ title: cleanTitle, kind });
      toast.success('새 자동완성 단어가 추가되었습니다.');
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-bold">자동완성 단어 추가</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              단어 (일정 제목)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 프로젝트 킥오프, 단위 테스트"
              required
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              분류
            </label>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="dialog-kind"
                  checked={kind === 'GROUP'}
                  onChange={() => setKind('GROUP')}
                  className="text-sky-600 focus:ring-sky-500"
                />
                <span>그룹 (GROUP)</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="dialog-kind"
                  checked={kind === 'ITEM'}
                  onChange={() => setKind('ITEM')}
                  className="text-sky-600 focus:ring-sky-500"
                />
                <span>작업 (ITEM)</span>
              </label>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-2 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {create.isPending ? '저장 중…' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
