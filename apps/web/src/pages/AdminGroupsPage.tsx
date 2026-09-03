import { Link, Navigate } from 'react-router-dom';
import { useMe } from '../lib/auth';
import { useGroupTree } from '../lib/groups';
import { apiErrorMessage } from '../lib/errors';

export default function AdminGroupsPage() {
  const me = useMe();
  const tree = useGroupTree();

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
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-bold">그룹 관리</h1>
      {tree.isError && (
        <p className="mt-4 text-sm text-rose-600">{apiErrorMessage(tree.error)}</p>
      )}
      {tree.data && (
        <p className="mt-4 text-sm text-slate-500">
          그룹 {tree.data.groups.length}개, 소속 {tree.data.memberships.length}건
        </p>
      )}
    </main>
  );
}
