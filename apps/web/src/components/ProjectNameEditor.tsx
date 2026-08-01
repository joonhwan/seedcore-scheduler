import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ProjectDetail } from '@sam/shared';
import { useUpdateProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import {
  canSubmitProjectName,
  normalizeProjectName,
  PROJECT_NAME_MAX_LENGTH,
} from '../lib/projectName';

/**
 * 프로젝트 명칭 인라인 편집.
 * 설계: docs/superpowers/specs/2026-08-01-project-rename-inline-design.md
 *
 * 권한 판단은 하지 않는다. 호출부가 `canRename` 으로 넘겨준다 (isAdmin && adminMode).
 */
export default function ProjectNameEditor({
  project,
  canRename,
}: {
  project: ProjectDetail;
  canRename: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateProject = useUpdateProject(project.id);

  // 편집 진입 시 자동 포커스 + 전체 선택
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(project.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(project.name);
  };

  const canSubmit = canSubmitProjectName(draft, project.name);

  const submit = async () => {
    if (!canSubmit || updateProject.isPending) return;
    try {
      await updateProject.mutateAsync({
        // 앞뒤 공백은 버리고 저장한다. 서버는 trim 하지 않는다.
        name: normalizeProjectName(draft),
        expectedUpdatedAt: project.updatedAt,
      });
      setEditing(false);
      toast.success('프로젝트 명칭이 변경되었습니다.');
    } catch (err) {
      // 409 를 포함해 실패 시에는 편집 모드를 유지한다. 방금 친 이름을 잃지 않게 하기 위함.
      // apiErrorMessage 가 409 를 CONFLICT 안내 문구로 바꿔 준다 (lib/errors.ts:36).
      toast.error(apiErrorMessage(err, '명칭 변경에 실패했습니다.'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5">
        {canRename && (
          <button
            type="button"
            onClick={startEdit}
            title="프로젝트 명칭 변경"
            aria-label="프로젝트 명칭 변경"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.5A2.25 2.25 0 0117.25 21H5.25A2.25 2.25 0 013 18.75V6.75A2.25 2.25 0 015.25 4.5h4.5" />
            </svg>
          </button>
        )}
        <span>{project.name}</span>
      </span>
    );
  }

  const pending = updateProject.isPending;

  return (
    <span className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="프로젝트 명칭"
        className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-lg font-bold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit || pending}
        title="확인"
        aria-label="명칭 변경 확인"
        className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {pending ? (
          <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={cancelEdit}
        disabled={pending}
        title="취소"
        aria-label="명칭 변경 취소"
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
