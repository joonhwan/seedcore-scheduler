import { Link } from 'react-router-dom';
import type { ProjectListItem, ProjectStatus } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProjects } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';

export default function ProjectsPage() {
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const projects = useProjects();
  const canCreate = me.data?.globalRole === 'ADMIN' && adminMode;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">프로젝트</h1>
        {canCreate && (
          <Link
            to="/projects/new"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            + 새 프로젝트
          </Link>
        )}
      </div>

      {projects.isLoading && (
        <p className="mt-6 text-sm text-slate-500">로딩…</p>
      )}
      {projects.isError && (
        <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">
          {apiErrorMessage(projects.error)}
        </p>
      )}
      {projects.data && projects.data.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          {adminMode
            ? '등록된 프로젝트가 없습니다. "+ 새 프로젝트" 로 생성하세요.'
            : '소속된 프로젝트가 없습니다. 관리자에게 멤버 추가를 요청하세요.'}
        </p>
      )}

      {projects.data && projects.data.length > 0 && (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-1 text-base font-semibold">{project.name}</h2>
        <StatusBadge status={project.status} />
      </div>
      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
          {project.description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>멤버 {project.memberCount}명</span>
        <span>·</span>
        <span>
          {project.myRole ? `내 역할: ${project.myRole}` : '비멤버 (ADMIN 우회)'}
        </span>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const cls =
    status === 'ACTIVE'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status === 'ACTIVE' ? '활성' : '보관'}
    </span>
  );
}
