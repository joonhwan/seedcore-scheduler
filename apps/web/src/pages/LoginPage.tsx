import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useLogin } from '../lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await login.mutateAsync({ username, password });
      navigate(r.passwordMustChange ? '/me/password' : from, { replace: true });
    } catch (err) {
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
          </div>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {login.isPending ? '로그인 중…' : '로그인'}
        </button>
      </form>
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
        return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
      case 'CSRF_ORIGIN_MISMATCH':
      case 'CSRF_ORIGIN_MISSING':
        return '요청 출처 검증에 실패했습니다. 새로고침 후 다시 시도하세요.';
      default:
        return code;
    }
  }
  return '알 수 없는 오류가 발생했습니다.';
}
