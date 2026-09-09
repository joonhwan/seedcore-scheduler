import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import PasswordChangeForm from '../components/PasswordChangeForm';
import { useMe, useUpdateMe } from '../lib/auth';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/**
 * 본인이 자기 정보를 고치는 화면.
 *
 * ID(username)는 바꿀 수 없다 — 감사로그·이력의 사람 표시가 이 값을 기준으로 하고,
 * 관리자만 계정을 만들 수 있는 구조이기 때문이다. 이름과 비밀번호만 여기서 고친다.
 */
export default function MyProfilePage() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 처음 me 가 도착했을 때(그리고 다른 곳에서 이름이 바뀌었을 때) 입력칸을 채운다.
  useEffect(() => {
    if (me.data) setDisplayName(me.data.displayName);
  }, [me.data?.displayName]);

  if (me.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (!me.data) return null;

  const trimmed = displayName.trim();
  const nameChanged = trimmed !== me.data.displayName;
  const nameValid = trimmed.length > 0 && trimmed.length <= 128;

  async function onSubmitName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateMe.mutateAsync({ displayName: trimmed });
      toast.success('이름이 변경되었습니다.');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto mt-10 w-full max-w-md p-4">
      <Link to="/" className="text-xs text-slate-500 hover:underline">
        ← 프로젝트 목록
      </Link>
      <h1 className="mt-1 text-xl font-bold">내 정보</h1>

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold">계정</h2>

        <div className="mt-3 flex items-baseline gap-2 text-sm">
          <span className="w-16 shrink-0 text-slate-600 dark:text-slate-400">ID</span>
          <span className="font-mono">{me.data.username}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">(변경할 수 없습니다)</span>
        </div>

        <form onSubmit={onSubmitName} className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="block text-slate-700 dark:text-slate-300">이름</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={128}
              required
            />
          </label>
          <button
            type="submit"
            disabled={!nameChanged || !nameValid || updateMe.isPending}
            className="rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {updateMe.isPending ? '저장 중…' : '저장'}
          </button>
        </form>
        {error && (
          <div className="mt-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          이름은 프로젝트 멤버 목록과 일정 이력에 표시됩니다.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold">비밀번호 변경</h2>
        <PasswordChangeForm
          username={me.data.username}
          onSuccess={() => toast.success('비밀번호가 변경되었습니다.')}
        />
      </section>
    </main>
  );
}
