import { Link } from 'react-router-dom';
import type { ProjectListItem } from '@sam/shared';
import { useProjectNameEdit } from '../lib/useProjectNameEdit';
import { PROJECT_NAME_MAX_LENGTH } from '../lib/projectName';

/**
 * 프로젝트 목록의 이름 셀. 보기 모드에서는 상세 화면 링크이고,
 * 연필 버튼을 누르면 그 자리가 입력창으로 바뀐다.
 * 설계: docs/superpowers/specs/2026-08-01-project-list-ui-design.md §5.3
 *
 * 편집 로직은 상세 화면 헤더(ProjectNameEditor)와 같은 훅을 쓴다.
 * 권한 판단은 하지 않는다. 호출부가 `canRename` 으로 넘겨준다.
 */
export default function ProjectNameCell({
  project,
  canRename,
}: {
  project: ProjectListItem;
  canRename: boolean;
}) {
  const edit = useProjectNameEdit(project);

  if (!edit.editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Link
          to={`/projects/${project.id}`}
          className="block truncate text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
          title={project.name}
        >
          {project.name}
        </Link>
        {canRename && (
          <button
            type="button"
            onClick={(e) => {
              // 이 버튼은 상세 화면 링크(Link)와 형제 관계라 지금은 막을 필요가 없지만,
              // 혹시 나중에 셀 전체가 링크로 감싸이도록 마크업이 바뀌더라도
              // 클릭이 링크 이동으로 처리되지 않게 방어적으로 막아 둔다.
              e.preventDefault();
              e.stopPropagation();
              edit.startEdit();
            }}
            title="프로젝트 명칭 변경"
            aria-label="프로젝트 명칭 변경"
            // 행에 마우스를 올렸을 때만 보인다. focus: 를 같이 주는 이유는
            // 키보드로 탭 이동할 때 보이지 않는 버튼에 포커스가 갇히지 않게 하기 위해서다.
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

  const pending = edit.pending;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        ref={edit.inputRef}
        type="text"
        value={edit.draft}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        disabled={pending}
        onChange={(e) => edit.setDraft(e.target.value)}
        onKeyDown={edit.handleKeyDown}
        aria-label="프로젝트 명칭"
        className="w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void edit.submit()}
        disabled={!edit.canSubmit || pending}
        title="확인"
        aria-label="명칭 변경 확인"
        className="shrink-0 rounded p-0.5 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {pending ? (
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
        disabled={pending}
        title="취소"
        aria-label="명칭 변경 취소"
        className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
