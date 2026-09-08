import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { useTheme } from './lib/theme';
import { useLogout, useMe } from './lib/auth';
import { useAdminMode } from './lib/adminMode';
import { APP_VERSION_LABEL } from './version';
import ToastViewport from './components/ToastViewport';
import SessionCountdownBadge from './components/SessionCountdownBadge';
import SessionExpiryDialog from './components/SessionExpiryDialog';
import ServerNoticeDialog from './components/ServerNoticeDialog';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectNewPage from './pages/ProjectNewPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectMembersPage from './pages/ProjectMembersPage';
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import ProjectClonePage from './pages/ProjectClonePage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminGroupsPage from './pages/AdminGroupsPage';
import AdminUserDetailPage from './pages/AdminUserDetailPage';
import AdminAutocompletePage from './pages/AdminAutocompletePage';
import AdminServerPage from './pages/AdminServerPage';
import UserGuidePage from './pages/UserGuidePage';
import { useParams } from 'react-router-dom';

function ProjectTimelineRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}`} replace />;
}

function NotFoundPage() {
  const location = useLocation();
  return (
    <main className="mx-auto max-w-lg p-10 text-center">
      <p className="text-4xl font-bold text-slate-300 dark:text-slate-700">404</p>
      <h1 className="mt-3 text-base font-bold text-slate-800 dark:text-slate-100">
        페이지를 찾을 수 없습니다.
      </h1>
      <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">
        요청한 주소: <span className="font-mono">{location.pathname}</span>
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70"
      >
        프로젝트 목록으로 돌아가기
      </Link>
    </main>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  // 서버에 물어보지 못한 것과 로그아웃이 확인된 것을 구분한다.
  //
  // 둘을 섞으면, 서버가 재시작되는 동안 새로고침한 사용자가 로그인 화면으로 밀려난다.
  // 세션과 쿠키는 멀쩡한데도 다시 로그인해야 하는 것처럼 보이고, 재시작 예고를 보고
  // 기다린 사용자에게 특히 아프다. useMe 는 401 일 때만 data 를 null 로 두고 그 밖의
  // 실패는 isError 로 남긴다(lib/auth.ts 주석 참고).
  //
  // 캐시가 남아 있으면(me.data) 이 화면을 띄우지 않고 보고 있던 화면을 그대로 둔다.
  // 실패한 재요청도 isError 를 세우므로, data 를 함께 보지 않으면 502 한 번에 작성 중이던
  // 편집 폼까지 통째로 언마운트되어 저장하지 않은 입력이 사라진다. 아래 안내가 약속하는
  // "보고 있던 화면으로 되돌아간다"는 라우트에만 해당하지 컴포넌트 상태까지 되살리지는
  // 못한다. 3초마다 다시 물어보는 재시도는 그동안에도 계속 돈다(lib/auth.ts).
  if (me.isError && !me.data) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          서버에 연결할 수 없습니다
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          서버가 재시작되는 중일 수 있습니다. <strong>로그인은 그대로 유지되며</strong>,
          연결이 돌아오면 보고 있던 화면으로 저절로 되돌아갑니다.
        </p>
        <button
          type="button"
          onClick={() => void me.refetch()}
          disabled={me.isFetching}
          className="mt-4 rounded bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {me.isFetching ? '연결하는 중…' : '지금 다시 시도'}
        </button>
      </main>
    );
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
      관리자 모드 활성 — 모든 프로젝트/노드를 우회 편집할 수 있습니다. 모든 변경은 감사로그에
      기록됩니다.
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
        <Link
          to="/"
          className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200"
          title="홈(프로젝트 목록) 화면 이동"
        >
          <img src="/logo_b.png" alt="시드코어" className="h-5 w-auto dark:invert" />
          <span className="text-sm">
            일정관리 시스템{' '}
            <span className="text-[10px] italic font-normal text-slate-400 dark:text-slate-500 ml-0.5">
              {APP_VERSION_LABEL}
            </span>
          </span>
        </Link>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m0 13.5V21M4.22 4.22l1.58 1.58m12.42 12.42l1.58 1.58M3 12h2.25m13.5 0H21M4.22 19.78l1.58-1.58m12.42-12.42l1.58-1.58M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
              />
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin/groups"
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="그룹 관리"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin/autocomplete"
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="자동완성 관리"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 21m0 0l-.813-5.096L3 15.187m6 5.813a2 2 0 100-4 2 2 0 000 4zM19.071 4.929a10 10 0 11-14.142 14.142 10 10 0 0114.142-14.142z"
                  />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin/server"
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="서버 관리"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z"
                  />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <div
                className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800/80 transition-colors cursor-pointer select-none"
                onClick={() => adminMode.toggle()}
                title={adminMode.on ? '관리자 모드 해제' : '관리자 모드 활성화'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill={adminMode.on ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className={`w-3.5 h-3.5 ${adminMode.on ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
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
            <SessionCountdownBadge />
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * 단축키 안내의 단일 원천.
 *
 * 예전에는 푸터의 호버 팝업과 모달이 같은 목록을 각각 손으로 적어 두었다. 그래서 한쪽만
 * 고치면 조용히 어긋났고, 실제로 확대 키 `=` 가 두 곳에서 빠져 있었다(도구막대 툴팁과
 * 사용설명서는 밝히고 있었다). 두 화면이 이 배열 하나를 읽는다.
 *
 * 각 항목은 실제 핸들러와 대조해 적었다 — Timeline.tsx(화살표·확대·축소·드래그 취소),
 * ProjectDetailPage.tsx(Enter·Ctrl+I·Ctrl+D), NodeDetail.tsx(진척율), NodeFormDialog.tsx
 * (종류 전환·ESC), 이 파일의 Footer(?·h). 단축키를 더하거나 고칠 때 여기도 함께 고친다.
 */
type ShortcutKey = { k: string; tag?: string };

type ShortcutRow = {
  label: string;
  keys: ShortcutKey[];
  /** 키 사이에 넣을 말. 기본은 '/'. */
  sep?: string;
  /** 키 뒤에 붙일 말 (예: '화살표 키'). */
  suffix?: string;
  /** 조건이나 주의. 라벨 아래 작은 글씨로 붙는다. */
  note?: string;
  /** 매니저·관리자만 쓸 수 있는 것. 권한이 없으면 눌러도 아무 일이 없다. */
  managerOnly?: boolean;
};

type ShortcutGroup = { title: string; rows: ShortcutRow[]; footnote?: string };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '🌐 어느 화면에서나',
    rows: [
      {
        label: '단축키 창 열기·닫기',
        keys: [{ k: '?' }, { k: 'h' }],
        sep: '또는',
        note: '로그인 화면에서도 열립니다.',
      },
    ],
  },
  {
    title: '📌 일정 트리 · 간트 (프로젝트 상세)',
    rows: [
      { label: '위 / 아래 탐색', keys: [{ k: '↑' }, { k: '↓' }], suffix: '화살표 키' },
      { label: '그룹 접기 / 펴기', keys: [{ k: '←' }, { k: '→' }], suffix: '화살표 키' },
      {
        label: '상세 편집 창 열기',
        keys: [{ k: 'Enter' }, { k: '더블클릭' }],
        sep: '또는',
        note: 'Enter 는 일정을 고른 뒤에만 열립니다.',
      },
      { label: '새 일정 추가', keys: [{ k: 'Ctrl + I' }], managerOnly: true },
      {
        label: '선택 일정 삭제',
        keys: [{ k: 'Ctrl + D' }],
        managerOnly: true,
        note: '고른 일정이 있을 때만 동작합니다.',
      },
      {
        // Timeline.tsx 는 '+' 와 '=' 를 함께 받는다. '+' 는 Shift 를 눌러야 나오므로
        // 실제로는 '=' 가 더 편하다.
        label: '간트 축소 / 확대',
        keys: [{ k: '-' }, { k: '+' }, { k: '=' }],
      },
    ],
    footnote:
      '체크박스로 여러 일정을 고르는 중에는 위 단축키가 모두 멈춥니다. 입력 칸에 커서가 있을 때도 동작하지 않습니다.',
  },
  {
    title: '📝 상세 편집 창 (모달 / 폼 내부)',
    rows: [
      {
        label: '진척율 조절 (일정)',
        keys: [
          { k: 'Ctrl + ,', tag: '-10%' },
          { k: 'Ctrl + .', tag: '+10%' },
          { k: 'Ctrl + /', tag: '100%' },
        ],
        sep: '',
      },
      {
        label: '노드 종류 전환',
        keys: [
          { k: 'Alt + 1', tag: '일정' },
          { k: 'Alt + 2', tag: '그룹' },
        ],
      },
      { label: '창 닫기 / 취소', keys: [{ k: 'ESC' }] },
    ],
  },
  {
    title: '🖱️ 드래그 도중',
    rows: [
      {
        label: '드래그 취소',
        keys: [{ k: 'ESC' }],
        note: '간트 막대는 곧바로 원래대로 돌아가고, 트리 행은 이동이 취소됩니다.',
      },
    ],
  },
];

/** 단축키 목록을 그린다. 호버 팝업과 모달이 크기만 달리해 같은 데이터를 쓴다. */
function ShortcutList({ compact }: { compact?: boolean }) {
  const kbd = compact
    ? 'px-1 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
    : 'px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono';
  const head = compact
    ? 'font-semibold text-slate-800 dark:text-slate-200 text-[11px] mb-1.5 flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded'
    : 'font-semibold text-slate-800 dark:text-slate-200 text-xs mb-2 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {SHORTCUT_GROUPS.map((g) => (
        <div key={g.title}>
          <div className={head}>
            <span>{g.title}</span>
          </div>
          <div className={compact ? 'space-y-1 pl-1' : 'space-y-1.5 pl-1'}>
            {g.rows.map((r) => (
              <div key={r.label} className="grid grid-cols-3 gap-2 items-start">
                <div className={compact ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-800 dark:text-slate-200'}>
                  {r.label}
                  {r.managerOnly && (
                    <span className="ml-1 text-amber-700 dark:text-amber-300" title="매니저 또는 관리자만 사용할 수 있습니다">
                      🔒
                    </span>
                  )}
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  {r.keys.map((key, i) => (
                    // 키와 그 뒤의 태그는 한 덩어리로 움직여야 한다. 묶지 않으면 좁은
                    // 팝업에서 "Ctrl + /" 와 "(100%)" 가 서로 다른 줄로 갈린다.
                    <span key={key.k} className="whitespace-nowrap">
                      {i > 0 && <span className="mr-1">{r.sep ?? '/'}</span>}
                      <kbd className={kbd}>{key.k}</kbd>
                      {key.tag && <span className="ml-0.5 text-[10px]">({key.tag})</span>}
                    </span>
                  ))}
                  {r.suffix && <span className="whitespace-nowrap">{r.suffix}</span>}
                  {r.note && (
                    <div className="w-full text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                      {r.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {g.footnote && (
            <p className="mt-1.5 pl-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              {g.footnote}
            </p>
          )}
        </div>
      ))}
    </div>
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
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      // 안내 문구가 "? 또는 h" 라고 적고 있어 h 도 함께 받는다 (예전에는 ? 만 동작했다).
      if (e.key === '?' || e.key === 'h' || e.key === 'H') {
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
        {/* 좌측: 단축키 및 사용설명서 */}
        <div className="flex items-center justify-start gap-2">
          <div className="relative group inline-block">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-300 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="단축키 안내 보기 (? 키)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6A2.25 2.25 0 001.5 8.25v7.5A2.25 2.25 0 003.75 18h16.5A2.25 2.25 0 0022.5 15.75v-7.5A2.25 2.25 0 0020.25 6H3.75zM3.75 9h16.5M6.75 12h.008v.008H6.75V12zm3 0h.008v.008H9.75V12zm3 0h.008v.008H12.75V12zm3 0h.008v.008H15.75V12zm3 0h.008v.008H18.75V12zM6.75 15h.008v.008H6.75V15zm10.5 0h.008v.008H17.25V15zM9 15h6"
                />
              </svg>
              <span>단축키 (?)</span>
            </button>

            {/* 단축키 안내 마우스 호버 팝업 */}
            <div className="pointer-events-none group-hover:pointer-events-auto absolute bottom-full left-0 mb-2 hidden group-hover:block w-[380px] rounded-lg border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200 z-50 transition-all duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2 mb-2.5">
                <span className="font-semibold text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1">
                  ⌨️ 키보드 단축키 안내
                </span>
                <span className="text-[10px] text-slate-400 font-mono">단축키: ? / h</span>
              </div>
              <div className="text-[11px] leading-tight text-slate-600 dark:text-slate-300">
                <ShortcutList compact />
              </div>
              {/* 말풍선 화살표 */}
              <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-white dark:border-t-slate-800"></div>
            </div>
          </div>

          <Link
            to="/help"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:text-sky-600 hover:bg-sky-50 dark:text-slate-400 dark:hover:text-sky-300 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            title="사용설명서"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
            <span>사용설명서</span>
          </Link>
        </div>

        {/* 중앙: 가운데 정렬 copyright */}
        <div className="text-center font-medium">
          &quot;Club 300&quot; All rights reserved (c) 2026
        </div>

        {/* 우측: 개발자 이메일 */}
        <div className="text-right text-[11px] text-slate-400 dark:text-slate-500">
          문의:{' '}
          <a
            href="mailto:joonhwan.lee@gmail.com"
            className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors font-mono"
          >
            joonhwan.lee@gmail.com
          </a>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-5 h-5 text-sky-600 dark:text-sky-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                />
              </svg>
              키보드 단축키 안내
            </h3>
            <div className="mt-4 text-xs text-slate-600 dark:text-slate-400 font-normal">
              <ShortcutList />
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
            path="/projects/:id/clone"
            element={
              <RequireAuth>
                <ProjectClonePage />
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
            path="/admin/users/:id"
            element={
              <RequireAuth>
                <AdminUserDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/groups"
            element={
              <RequireAuth>
                <AdminGroupsPage />
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
            path="/admin/server"
            element={
              <RequireAuth>
                <AdminServerPage />
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
          {/*
            어디에도 걸리지 않는 주소는 안내를 보여준다. 이 라우트가 없으면 헤더와 푸터만 뜨고
            본문이 백지로 남아서, 오타로 잘못 들어온 사용자에게는 화면이 깨진 것처럼 보인다.
          */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
      <ToastViewport />
      {/*
        세션 만료 안내 창. 라우트 밖에 두어야 어느 화면에서 작업 중이든 똑같이 뜬다.
        로그인 전에는 스스로 아무것도 그리지 않는다.
      */}
      <SessionExpiryDialog />
      <ServerNoticeDialog />
    </div>
  );
}
