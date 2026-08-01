import type { ProjectListItem } from '@sam/shared';
import { useUpdateProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/**
 * 프로젝트 목록 행의 보관 / 복원 버튼.
 * 설계: docs/superpowers/specs/2026-08-01-project-list-ui-design.md §6
 *
 * 행 단위 컴포넌트인 이유는 useUpdateProject 가 훅이라 map() 안에서 부를 수 없기 때문이다.
 *
 * 권한 판단은 하지 않는다. 이 버튼이 들어가는 '관리' 컬럼 자체가
 * 관리자 모드에서만 렌더링된다 (ProjectsPage).
 */
export default function ProjectArchiveButton({ project }: { project: ProjectListItem }) {
  const updateProject = useUpdateProject(project.id);
  const archived = project.status === 'ARCHIVED';

  async function toggle() {
    if (updateProject.isPending) return;

    // 보관만 확인을 받는다. 복원은 그 자체가 되돌리는 동작이라 잘못 눌러도 손해가 없다.
    if (!archived) {
      const ok = window.confirm(
        `'${project.name}' 을(를) 보관 처리합니다.\n\n` +
          "보관된 프로젝트도 목록의 '복원' 버튼으로 언제든 다시 활성 상태로 되돌릴 수 있습니다.",
      );
      if (!ok) return;
    }

    try {
      await updateProject.mutateAsync({
        status: archived ? 'ACTIVE' : 'ARCHIVED',
        expectedUpdatedAt: project.updatedAt,
      });
      toast.success(archived ? '복원되었습니다.' : '보관 처리되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const pending = updateProject.isPending;

  // 색은 상세 화면의 보관(amber) / 복원(emerald) 버튼과 맞춘다.
  // 다만 같은 칸의 복제·삭제와 모양을 맞춰 아이콘이 아니라 글자 배지로 만든다.
  const cls = archived
    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/60'
    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/60';

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      title={archived ? '프로젝트를 활성 상태로 복원' : '프로젝트 보관 처리'}
      className={`min-w-[3rem] rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      {pending ? '…' : archived ? '복원' : '보관'}
    </button>
  );
}
