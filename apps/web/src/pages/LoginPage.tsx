import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useLogin } from '../lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** 로그인 제한이 풀리는 시각(epoch ms). 제한에 걸리지 않았으면 null. */
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  /**
   * 남은 시간을 초 단위로 세어 보여준다. 서버가 알려준 시각까지는 다시 눌러도 거부되므로
   * 버튼도 함께 잠근다 — 몇 초를 기다려야 하는지 모르는 채로 계속 누르는 상황을 없앤다.
   */
  useEffect(() => {
    if (retryAt === null) return;
    const tick = () => {
      const left = Math.ceil((retryAt - Date.now()) / 1000);
      if (left <= 0) {
        setRetryAt(null);
        setWaitSeconds(0);
        setError(null);
        return;
      }
      setWaitSeconds(left);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [retryAt]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (waitSeconds > 0) return;
    setError(null);
    try {
      const r = await login.mutateAsync({ username, password });
      navigate(r.passwordMustChange ? '/me/password' : from, { replace: true });
    } catch (err) {
      const wait = retryAfterSeconds(err);
      if (wait !== null) setRetryAt(Date.now() + wait * 1000);
      setError(toMessage(err));
    }
  }

  return (
    <main className="mx-auto mt-16 w-full max-w-sm rounded-lg border border-slate-200 p-6 dark:border-slate-700">
      <h1 className="text-xl font-bold">로그인</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">ID</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">비밀번호</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
            {waitSeconds > 0 && ` ${waitSeconds}초 뒤에 다시 시도할 수 있습니다.`}
          </div>
        )}
        <button
          type="submit"
          disabled={login.isPending || waitSeconds > 0}
          className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {waitSeconds > 0
            ? `${waitSeconds}초 뒤 재시도 가능`
            : login.isPending
              ? '로그인 중…'
              : '로그인'}
        </button>
      </form>
      <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div>&quot;Club 300&quot; All rights reserved (c) 2026</div>
        <div className="mt-1">
          문의: <a href="mailto:joonhwan.lee@gmail.com" className="text-sky-600 hover:underline dark:text-sky-400 font-mono">joonhwan.lee@gmail.com</a>
        </div>
      </footer>
    </main>
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code =
      (err.body as { error?: string } | undefined)?.error ?? `HTTP ${err.status}`;
    switch (code) {
      case 'INVALID_CREDENTIALS':
        return 'ID 또는 비밀번호가 올바르지 않습니다.';
      case 'ACCOUNT_LOCKED':
        return '여러 차례 실패로 계정이 일시 잠금되었습니다. 관리자에게 문의하세요.';
      case 'RATE_LIMITED':
        // 남은 시간은 화면에서 초 단위로 세어 덧붙인다. 서버가 그 값을 주지 못하는 경우
        // (구버전 API) 에만 예전 문구로 물러난다.
        return retryAfterSeconds(err) !== null
          ? '로그인 시도가 너무 잦습니다.'
          : '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
      case 'CSRF_ORIGIN_MISMATCH':
      case 'CSRF_ORIGIN_MISSING':
        return '요청 출처 검증에 실패했습니다. 새로고침 후 다시 시도하세요.';
      default:
        return code;
    }
  }
  return '알 수 없는 오류가 발생했습니다.';
}

/**
 * 로그인 제한이 풀릴 때까지 남은 시간(초). 제한에 걸린 응답이 아니면 null.
 *
 * 서버는 이 값을 401 본문의 retryAfterSeconds 로 내려준다 (auth.service.ts 의 login()).
 * 상태 코드가 429 가 아니고 Retry-After 헤더도 없으므로 본문에서 읽는다.
 */
function retryAfterSeconds(err: unknown): number | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: string; retryAfterSeconds?: unknown } | undefined;
  if (body?.error !== 'RATE_LIMITED') return null;
  const sec = body.retryAfterSeconds;
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return null;
  return Math.ceil(sec);
}
