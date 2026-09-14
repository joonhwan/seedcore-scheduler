import { useState } from 'react';
import {
  PROJECT_PRIORITY_OPTIONS,
  projectPriorityLabel,
  type ProjectListItem,
} from '@sam/shared';
import { useUpdateProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/**
 * 프로젝트 목록의 중요도 셀.
 *
 * **색은 양수에만 준다.** 일곱 값 모두에 색을 주면 목록이 알록달록해져 오히려 무엇이
 * 중요한지 안 보인다. 0 과 음수는 차분하게 둔다.
 */
function toneOf(value: number): string {
  if (value >= 2) {
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80';
  }
  if (value === 1) {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700';
}

/**
 * canManage 가 true 인 경우에만 편집 수단(드롭다운)을 보인다 — 그 프로젝트의 MANAGER 와
 * 관리자 모드를 켠 ADMIN 뿐이다. 값이 일곱 개뿐이라 고르는 즉시 저장하고, 별도의
 * 확인 버튼은 두지 않는다(조작만 늘어난다).
 */
export default function ProjectPriorityCell({
  project,
  canManage,
}: {
  project: ProjectListItem;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const updateProject = useUpdateProject(project.id);

  const badge = (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${toneOf(
        project.priority,
      )}`}
    >
      {projectPriorityLabel(project.priority)}
    </span>
  );

  if (!canManage) return badge;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="중요도 변경"
        className="cursor-pointer"
      >
        {badge}
      </button>
    );
  }

  return (
    <select
      autoFocus
      disabled={updateProject.isPending}
      defaultValue={String(project.priority)}
      onBlur={() => setEditing(false)}
      onChange={async (e) => {
        const next = Number(e.target.value);
        if (next === project.priority) {
          setEditing(false);
          return;
        }
        try {
          await updateProject.mutateAsync({
            priority: next,
            expectedUpdatedAt: project.updatedAt,
          });
        } catch (err) {
          // 409 는 남이 먼저 고쳤다는 뜻이다. 목록을 새로 받으면 최신 값이 온다.
          toast.error(apiErrorMessage(err));
        } finally {
          setEditing(false);
        }
      }}
      className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
    >
      {PROJECT_PRIORITY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
