import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
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
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminAutocompletePage from './pages/AdminAutocompletePage';
import UserGuidePage from './pages/UserGuidePage';
import { useParams } from 'react-router-dom';

function ProjectTimelineRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}`} replace />;
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
    <header className="flex items-center justify-between border-b border-slate-200 px-4 py-1.5 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors shrink-0">
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200" title="홈(프로젝트 목록) 화면 이동">
          <img src="/logo_b.png" alt="시드코어" className="h-5 w-auto dark:invert" />
          <span className="text-sm">일정관리 시스템</span>
        </Link>
        {me.data && (
          <Link
            to="/help"
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-slate-600 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-300 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700 transition-colors ml-1"
            title="사용법 보기 (도움말)"
            aria-label="사용법 보기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            <span>사용법 보기</span>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-label="테마 전환"
        >
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m0 13.5V21M4.22 4.22l1.58 1.58m12.42 12.42l1.58 1.58M3 12h2.25m13.5 0H21M4.22 19.78l1.58-1.58m12.42-12.42l1.58-1.58M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>
        {me.data && (
          <>
            {isAdmin && (
              <Link
                to="/admin/users"
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="사용자 관리"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin/autocomplete"
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="자동완성 관리"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21m0 0l-.813-5.096L3 15.187m6 5.813a2 2 0 100-4 2 2 0 000 4zM19.071 4.929a10 10 0 11-14.142 14.142 10 10 0 0114.142-14.142z" />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <div 
                className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800/80 transition-colors cursor-pointer select-none"
                onClick={() => adminMode.toggle()}
                title={adminMode.on ? "관리자 모드 해제" : "관리자 모드 활성화"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill={adminMode.on ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 ${adminMode.on ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <button
                  type="button"
                  className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    adminMode.on ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={adminMode.on}
                >
                  <span
                    className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      adminMode.on ? 'translate-x-2.5' : 'translate-x-0.5'
                    } mt-[1px]`}
                  />
                </button>
              </div>
            )}
            <span className="text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-3">
              {me.data.displayName}
              {isAdmin ? ' (ADMIN)' : ''}
            </span>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
              title="로그아웃"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function Footer() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setIsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <footer className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 shrink-0 grid grid-cols-3 items-center">
        {/* 좌측: 단축키 보기(?) 및 마우스 호버 팝업 / 클릭 또는 ? 키로 모달 토글 */}
        <div className="flex items-center justify-start">
          <div className="relative group inline-block">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-300 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="단축키 안내 보기 (? 키)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              <span>단축키 보기 (?)</span>
            </button>

            {/* 단축키 안내 마우스 호버 팝업 */}
            <div className="pointer-events-none group-hover:pointer-events-auto absolute bottom-full left-0 mb-2 hidden group-hover:block w-72 rounded-lg border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200 z-50 transition-all duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2 mb-2">
                <span className="font-semibold text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                  ⌨️ 주요 단축키 안내
                </span>
                <span className="text-[10px] text-slate-400 font-mono">단축키: ?</span>
              </div>
              <ul className="space-y-1.5 text-[11px] leading-tight text-slate-600 dark:text-slate-300">
                <li className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">선택 일정 상세 편집</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">Enter / 더블클릭</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">새 일정/그룹 추가</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">Ctrl + I</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">선택 일정 삭제</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">Ctrl + D</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">간트 축소 / 확대</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">+ / -</kbd>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">노드 종류 전환 (추가 창)</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200">Alt + 1 / Alt + 2</kbd>
                </li>
              </ul>
              <div className="mt-2.5 border-t border-slate-100 dark:border-slate-700/60 pt-2 text-right">
                <Link to="/help" className="text-[10px] text-sky-600 hover:underline dark:text-sky-400 font-medium">
                  전체 사용설명서 보기 →
                </Link>
              </div>
              {/* 말풍선 화살표 */}
              <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-white dark:border-t-slate-800"></div>
            </div>
          </div>
        </div>

        {/* 중앙: 가운데 정렬 copyright */}
        <div className="text-center font-medium">
          &quot;Club 300&quot; all right reserverd (c) 2029
        </div>

        {/* 우측: 개발자 이메일 */}
        <div className="text-right text-[11px] text-slate-400 dark:text-slate-500">
          문의: <a href="mailto:joonhwan.lee@gmail.com" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors font-mono">joonhwan.lee@gmail.com</a>
        </div>
      </footer>

      {/* 단축키 안내 팝업 모달 (? 키 누름 또는 클릭 시) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in-50 duration-100">
          <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 p-1.5 transition-colors"
              aria-label="모달 닫기"
            >
              <span className="text-xl font-bold">✕</span>
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-sky-600 dark:text-sky-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              키보드 단축키 안내
            </h3>
            <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-400 font-normal">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                <div>동작</div>
                <div className="col-span-2">단축키 / 조작법</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">일정 선택 / 편집</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">더블클릭</kbd> 또는 <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Enter</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">새 일정 추가</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Ctrl + I</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">일정 삭제</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Ctrl + D</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">위/아래 탐색</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">↑</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">↓</kbd> 화살표 키</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">그룹 접기/펴기</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">←</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px">→</kbd> 화살표 키</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">간트 축소/확대</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono">+</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono">-</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center border-t border-slate-100 dark:border-slate-800/60 pt-2">
                <div className="font-medium text-slate-800 dark:text-slate-200">진행률 조절</div>
                <div className="col-span-2 font-mono text-[10px]"><kbd className="px-1 py-0.5 rounded border bg-slate-50 dark:bg-slate-800">Ctrl+,</kbd>(-10%) <kbd className="px-1 py-0.5 rounded border bg-slate-50 dark:bg-slate-800">Ctrl+.</kbd>(+10%) <kbd className="px-1 py-0.5 rounded border bg-slate-50 dark:bg-slate-800">Ctrl+/</kbd>(100%)</div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <Link
                to="/help"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400"
              >
                전체 사용설명서 보기 →
              </Link>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 text-xs font-semibold transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Header />
      <AdminBanner />
      <div id="app-main-content" className="flex-1 min-h-0 overflow-y-auto">
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
            path="/projects/:id/timeline"
            element={
              <RequireAuth>
                <ProjectTimelineRedirect />
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
            path="/projects/:id/history"
            element={
              <RequireAuth>
                <ProjectHistoryPage />
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
          <Route
            path="/admin/autocomplete"
            element={
              <RequireAuth>
                <AdminAutocompletePage />
              </RequireAuth>
            }
          />
          <Route
            path="/help"
            element={
              <RequireAuth>
                <UserGuidePage />
              </RequireAuth>
            }
          />
          <Route
            path="/guide"
            element={
              <RequireAuth>
                <UserGuidePage />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
      <Footer />
      <ToastViewport />
    </div>
  );
}
