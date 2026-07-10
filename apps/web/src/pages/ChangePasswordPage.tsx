import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@sam/shared';
import { ApiError } from '../lib/api';
import { useChangePassword, useMe } from '../lib/auth';

export default function ChangePasswordPage() {
  const me = useMe();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError('새 비밀번호와 확인이 일치하지 않습니다.');
      return;
    }
    const username = me.data?.username ?? '';
    const policy = validatePassword(next, username);
    if (policy) {
      setError(policyMessage(policy));
      return;
    }
    if (next === current) {
      setError('새 비밀번호는 현재 비밀번호와 달라야 합니다.');
      return;
    }

    try {
      await change.mutateAsync({ current, next });
      navigate('/', { replace: true });
    } catch (err) {
      setError(toMessage(err));
    }
  }

  return (
    <main className="mx-auto mt-16 w-full max-w-sm rounded-lg border border-slate-200 p-6 dark:border-slate-700">
      <h1 className="text-xl font-bold">비밀번호 변경</h1>
      {me.data?.passwordMustChange && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          첫 로그인이거나 관리자가 비밀번호를 재설정했습니다. 변경 후 다시 로그인해 주세요.
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <PasswordField
          label="현재 비밀번호"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <PasswordField
          label="새 비밀번호"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <PasswordField
          label="새 비밀번호 확인"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={change.isPending}
          className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {change.isPending ? '변경 중…' : '변경'}
        </button>
      </form>
    </main>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-700 dark:text-slate-300">{label}</span>
      <input
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={PASSWORD_MIN_LENGTH}
      />
    </label>
  );
}

function policyMessage(reason: ReturnType<typeof validatePassword>): string {
  switch (reason) {
    case 'TOO_SHORT':
      return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
    case 'INSUFFICIENT_VARIETY':
      return '영문, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.';
    case 'CONTAINS_USERNAME':
      return '비밀번호에 ID 를 포함할 수 없습니다.';
    default:
      return '비밀번호 정책 위반';
  }
}

function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string; reason?: string } | undefined;
    const code = body?.error ?? `HTTP ${err.status}`;
    switch (code) {
      case 'CURRENT_PASSWORD_INVALID':
        return '현재 비밀번호가 올바르지 않습니다.';
      case 'PASSWORD_POLICY_VIOLATION':
        return policyMessage((body?.reason ?? '') as never);
      case 'PASSWORD_REUSE':
        return '새 비밀번호는 현재 비밀번호와 달라야 합니다.';
      default:
        return code;
    }
  }
  return '알 수 없는 오류가 발생했습니다.';
}
