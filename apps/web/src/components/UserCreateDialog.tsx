import { useState } from 'react';
import { CreateUserDto, validatePassword } from '@sam/shared';
import { useCreateUser } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function UserCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (temporaryPassword: string | null, displayName: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUser();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = CreateUserDto.safeParse({
      username: username.trim(),
      displayName: displayName.trim(),
      initialPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }
    const policy = validatePassword(parsed.data.initialPassword, parsed.data.username);
    if (policy) {
      setError(
        policy === 'TOO_SHORT'
          ? '비밀번호는 최소 10자 이상이어야 합니다.'
          : policy === 'INSUFFICIENT_VARIETY'
            ? '비밀번호는 영문/숫자/특수 중 3종 이상을 포함해야 합니다.'
            : 'username 을 비밀번호에 포함할 수 없습니다.',
      );
      return;
    }

    try {
      await create.mutateAsync(parsed.data);
      toast.success('사용자가 생성되었습니다. 첫 로그인 시 비밀번호 변경이 강제됩니다.');
      onCreated(null, parsed.data.displayName);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">사용자 추가</h2>
        <p className="mt-1 text-xs text-slate-500">
          USER 권한으로 생성됩니다. 첫 로그인 시 비밀번호 변경이 강제됩니다.
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder="alice"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            영문/숫자/._- 만 허용. 3~64자. 생성 후 변경 불가.
          </span>
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">표시 이름</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="앨리스"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">초기 비밀번호</span>
          <input
            type="text"
            value={initialPassword}
            onChange={(e) => setInitialPassword(e.target.value)}
            placeholder="최소 10자, 영·숫·특 중 3종"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        {error && (
          <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            생성
          </button>
        </div>
      </form>
    </div>
  );
}
