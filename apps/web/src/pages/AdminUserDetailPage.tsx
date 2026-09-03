import { Link, Navigate, useParams } from 'react-router-dom';
import { useMe } from '../lib/auth';
import { useUserGroups, useUserProjects } from '../lib/userProjects';
import { apiErrorMessage } from '../lib/errors';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const projects = useUserProjects(id);
  const groups = useUserGroups(id);

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/admin/users" className="text-xs text-slate-500 hover:underline">
        ← 사용자 관리
      </Link>
      <h1 className="mt-1 text-xl font-bold">사용자 상세</h1>
      {projects.isError && (
        <p className="mt-4 text-sm text-rose-600">{apiErrorMessage(projects.error)}</p>
      )}
      {projects.data && (
        <p className="mt-4 text-sm text-slate-500">
          소속 그룹 {groups.data?.length ?? 0}개, 참여 프로젝트 {projects.data.length}건
        </p>
      )}
    </main>
  );
}
