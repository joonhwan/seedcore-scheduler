import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTheme } from './lib/theme';
import { useLogout, useMe } from './lib/auth';
import { useAdminMode } from './lib/adminMode';
import ToastViewport from './components/ToastViewport';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectMembersPage from './pages/ProjectMembersPage';
import AdminUsersPage from './pages/AdminUsersPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (me.data.passwordMustChange && location.pathname !== '/me/password') {
    return <Navigate to="/me/password" replace />;
  }
  return <>{children}</>;
}

function AdminBanner() {
  const { on } = useAdminMode();
  const me = useMe();
  if (!on || me.data?.globalRole !== 'ADMIN') return null;
  return (
    <div className="border-b border-amber-300 bg-amber-100 px-6 py-1.5 text-center text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
      관리자 모드 활성 — 모든 프로젝트/노드를 우회 편집할 수 있습니다. 모든 변경은 감사로그에 기록됩니다.
    </div>
  );
}

function Header() {
  const { theme, toggle: toggleTheme } = useTheme();
  const me = useMe();
  const logout = useLogout();
  const adminMode = useAdminMode();
  const isAdmin = me.data?.globalRole === 'ADMIN';

  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
      <Link to="/" className="font-semibold">
        SAM Scheduler
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {me.data && (
          <>
            {isAdmin && (
              <Link
                to="/admin/users"
                className="text-slate-600 hover:underline dark:text-slate-400"
              >
                사용자 관리
              </Link>
            )}
            {isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-500"
                  checked={adminMode.on}
                  onChange={() => adminMode.toggle()}
                />
                <span className={adminMode.on ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'}>
                  관리자 모드
                </span>
              </label>
            )}
            <span className="text-slate-600 dark:text-slate-400">
              {me.data.displayName}
              {isAdmin ? ' (ADMIN)' : ''}
            </span>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="rounded-md border border-slate-300 px-3 py-1 dark:border-slate-700"
            >
              로그아웃
            </button>
          </>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md border border-slate-300 px-3 py-1 dark:border-slate-700"
          aria-label="테마 전환"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <AdminBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/me/password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/new"
          element={
            <RequireAuth>
              <ProjectNewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <RequireAuth>
              <ProjectDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/projects/:id/members"
          element={
            <RequireAuth>
              <ProjectMembersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <AdminUsersPage />
            </RequireAuth>
          }
        />
      </Routes>
      <ToastViewport />
    </>
  );
}
