import type { ProjectDetail } from '@sam/shared';
import { useProjectDescriptionEdit } from '../lib/useProjectDescriptionEdit';

/**
 * 프로젝트 설명 인라인 편집 — 상세 화면 헤더용.
 *
 * 편집 로직은 lib/useProjectDescriptionEdit.ts 에 있다. 목록 셀
 * (ProjectDescriptionCell)과 같은 로직을 쓰되 겉모습만 다르다.
 *
 * **설명이 비어 있어도 자리를 그린다.** 목록 셀은 `-` 를 보여 주는데, 여기서는
 * 안내 문구를 흐리게 보여 준다. 권한이 있는 사람에게 자리가 아예 보이지 않으면
 * 설명을 새로 넣을 방법이 없기 때문이다 (예전에는 `project.description && ...` 로
 * 감싸여 있어 빈 설명이면 요소 자체가 사라졌다).
 *
 * **보기 모드에서는 여러 줄 설명도 한 줄로 자른다.** 이 자리는 헤더이고 바로 아래가
 * 간트라, 줄 수대로 펼치면 설명이 긴 프로젝트일수록 간트가 아래로 밀려난다. 전체 내용은
 * 툴팁(title)으로 보고, 편집에 들어가면 입력창이 원래 줄바꿈을 그대로 유지한다.
 *
 * 권한 판단은 하지 않는다. 호출부가 `canManage` 로 넘겨준다.
 */
export default function ProjectDescriptionEditor({
  project,
  canManage,
}: {
  project: ProjectDetail;
  canManage: boolean;
}) {
  const edit = useProjectDescriptionEdit(project);

  if (!edit.editing) {
    // 설명도 없고 고칠 권한도 없으면 빈 자리를 차지하지 않는다.
    if (!project.description && !canManage) return null;

    return (
      <p className="mt-0.5 flex min-w-0 max-w-2xl items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
        <span
          className={`truncate ${project.description ? '' : 'italic text-slate-400 dark:text-slate-500'}`}
          title={project.description ?? ''}
        >
          {project.description ?? '설명 없음'}
        </span>
        {canManage && (
          <button
            type="button"
            onClick={edit.startEdit}
            title="프로젝트 설명 변경"
            aria-label="프로젝트 설명 변경"
            className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.5A2.25 2.25 0 0117.25 21H5.25A2.25 2.25 0 013 18.75V6.75A2.25 2.25 0 015.25 4.5h4.5" />
            </svg>
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="mt-0.5 flex items-start gap-1.5">
      <textarea
        autoFocus
        rows={3}
        maxLength={2000}
        value={edit.draft}
        disabled={edit.pending}
        onChange={(e) => edit.setDraft(e.target.value)}
        // blur 로는 저장하지 않는다 — 훅의 주석 참고.
        onKeyDown={edit.handleKeyDown}
        placeholder="Ctrl+Enter 로 저장, Esc 로 취소"
        aria-label="프로젝트 설명"
        className="w-full max-w-xl rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void edit.submit()}
        disabled={edit.pending}
        title="확인"
        aria-label="설명 변경 확인"
        className="shrink-0 rounded p-1 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {edit.pending ? (
          <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={edit.cancelEdit}
        disabled={edit.pending}
        title="취소"
        aria-label="설명 변경 취소"
        className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
