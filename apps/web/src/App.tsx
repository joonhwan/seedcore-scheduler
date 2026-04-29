import { Routes, Route, Link } from 'react-router-dom';
import { useTheme } from './lib/theme';

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">SAM Scheduler</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        프로젝트 일정관리 — M0 스캐폴딩 단계입니다.
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

export default function App() {
  const { theme, toggle } = useTheme();
  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
        <Link to="/" className="font-semibold">
          SAM Scheduler
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm dark:border-slate-700"
          aria-label="테마 전환"
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  );
}
