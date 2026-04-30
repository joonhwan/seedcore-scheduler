import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTheme } from './lib/theme';
import { useLogout, useMe } from './lib/auth';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">SAM Scheduler</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        프로젝트 일정관리 — M1 인증 단계까지 동작합니다.
      </p>
      <p className="mt-4 text-sm">
        API 헬스체크:{' '}
        <a
          className="text-sky-600 underline dark:text-sky-400"
          href="/api/v1/health"
          target="_blank"
          rel="noreferrer"
        >
          /api/v1/health
        </a>
      </p>
    </main>
  );
}

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

function Header() {
  const { theme, toggle } = useTheme();
  const me = useMe();
  const logout = useLogout();
  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
      <Link to="/" className="font-semibold">
        SAM Scheduler
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {me.data && (
          <>
            <span className="text-slate-600 dark:text-slate-400">
              {me.data.displayName}
              {me.data.globalRole === 'ADMIN' ? ' (ADMIN)' : ''}
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
          onClick={toggle}
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
              <Home />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  );
}
