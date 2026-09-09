import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@sam/shared';
import { ApiError } from '../lib/api';
import { useChangePassword } from '../lib/auth';

/**
 * 비밀번호 변경 폼.
 *
 * 첫 로그인 강제 변경 화면(ChangePasswordPage)과 내 정보 화면(MyProfilePage) 두 곳이
 * 이것을 함께 쓴다. 두 곳에 같은 폼을 복사해 두면 오류 문구가 조용히 어긋난다.
 *
 * 성공한 뒤에 무엇을 할지는 부르는 쪽이 정한다 — 강제 변경 화면은 홈으로 보내고,
 * 내 정보 화면은 그 자리에 머문 채 알림만 띄운다.
 */
export default function PasswordChangeForm({
  username,
  onSuccess,
}: {
  /** 비밀번호 정책 검사에 쓴다 (ID 를 포함했는지 확인하는 규칙). */
  username: string;
  onSuccess: () => void;
}) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (next !== confirm) {
      setError('새 비밀번호와 확인이 일치하지 않습니다.');
      return;
    }
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
      setCurrent('');
      setNext('');
      setConfirm('');
      onSuccess();
    } catch (err) {
      setError(toMessage(err));
    }
  }

  return (
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
