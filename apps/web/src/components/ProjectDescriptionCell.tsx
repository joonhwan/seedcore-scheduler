import { useState } from 'react';
import type { ProjectListItem } from '@sam/shared';
import { useUpdateProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/**
 * 프로젝트 목록의 설명 셀.
 *
 * 보기 모드에서는 한 줄로 자르고, 편집에 들어가면 **그 자리가 여러 줄 입력창으로
 * 늘어난다.** 설명은 최대 2000자라 한 줄짜리 입력창으로는 쓰기 어려운데, 요구의 핵심이
 * "목록 화면을 벗어나지 않는 것" 이라 팝오버 대신 이 방식을 골랐다. 편집하는 동안 행
 * 높이가 커지는 것은 편집 중임을 드러내는 신호로도 읽힌다.
 *
 * 이름 편집과 달리 훅으로 빼지 않는다 — 목록에서만 쓰이는 동작이라 파일을 나눌
 * 이유가 없다(설계 §8.3).
 */
export default function ProjectDescriptionCell({
  project,
  canManage,
}: {
  project: ProjectListItem;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description ?? '');
  const updateProject = useUpdateProject(project.id);

  const submit = async () => {
    const next = draft.trim();
    const before = project.description ?? '';
    if (next === before) {
      setEditing(false);
      return;
    }
    try {
      await updateProject.mutateAsync({
        // 빈 문자열은 "설명 없음" 이므로 null 로 보낸다. 빈 문자열 그대로 보내면
        // 설명이 있는데 내용이 빈 상태가 되어 "지운 것" 과 구별되지 않는다.
        description: next === '' ? null : next,
        expectedUpdatedAt: project.updatedAt,
      });
      setEditing(false);
    } catch (err) {
      // 409 는 남이 먼저 고쳤다는 뜻이다. 조용히 삼키지 않는다.
      toast.error(apiErrorMessage(err));
    }
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate" title={project.description ?? ''}>
          {project.description ?? '-'}
        </span>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setDraft(project.description ?? '');
              setEditing(true);
            }}
            title="설명 변경"
            aria-label="설명 변경"
            className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover/row:opacity-100 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.5A2.25 2.25 0 0117.25 21H5.25A2.25 2.25 0 013 18.75V6.75A2.25 2.25 0 015.25 4.5h4.5" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  const pending = updateProject.isPending;

  return (
    <textarea
      autoFocus
      rows={3}
      maxLength={2000}
      value={draft}
      disabled={pending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void submit()}
      onKeyDown={(e) => {
        // 여러 줄 입력이므로 Enter 는 줄바꿈이다. 저장은 Ctrl+Enter 로 한다.
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditing(false);
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void submit();
        }
      }}
      aria-label="프로젝트 설명"
      className="w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
  );
}
