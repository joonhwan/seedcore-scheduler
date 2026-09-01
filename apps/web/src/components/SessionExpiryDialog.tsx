/**
 * 세션 만료 안내 창.
 *
 * 만료 10분 전부터 떠서 남은 시간을 세고, 연장할지 지금 끝낼지 묻는다. 관공서 시스템의
 * 로그인 연장 창과 같은 동작을 요청받아 만들었다.
 *
 * 창을 닫아 두는 선택지를 주지 않는 것은 의도한 것이다. 닫아 놓으면 그대로 잊어버려
 * 편집하던 내용을 잃는 것이 원래 문제였다. 대신 연장 버튼 한 번으로 끝나게 해 두었다.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SESSION_EXPIRY_WARNING_MS } from '@sam/shared';
import { useLogout, useMe } from '../lib/auth';
import { useExtendSession, useSessionRemaining } from '../lib/session';
import { formatRemaining } from '../lib/sessionCountdown';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function SessionExpiryDialog() {
  const me = useMe();
  const remaining = useSessionRemaining();
  const extend = useExtendSession();
  const logout = useLogout();
  const qc = useQueryClient();

  const loggedIn = !!me.data;
  const expired = loggedIn && remaining !== null && remaining <= 0;

  // 만료 시각이 지나면 화면을 로그아웃 상태로 바꾼다. 서버 세션은 이미 죽었으므로 다음
  // 요청이 어차피 401 을 받지만, 사용자가 아무것도 누르지 않고 있으면 그 요청조차 없어서
  // 화면이 살아 있는 것처럼 남는다.
  useEffect(() => {
    if (!expired) return;
    qc.setQueryData(['auth', 'me'], null);
    toast.error('로그인 시간이 만료되어 로그아웃되었습니다. 다시 로그인해 주십시오.');
  }, [expired, qc]);

  if (!loggedIn || remaining === null) return null;
  if (remaining > SESSION_EXPIRY_WARNING_MS) return null;
  if (remaining <= 0) return null;

  const onExtend = async () => {
    try {
      await extend.mutateAsync();
      toast.success('로그인이 연장되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const onLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // 세션이 이미 사라진 경우에도 화면은 로그아웃 상태로 넘긴다.
      qc.setQueryData(['auth', 'me'], null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expiry-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <h2
          id="session-expiry-title"
          className="text-sm font-bold text-slate-800 dark:text-slate-100"
        >
          로그인 시간이 곧 만료됩니다
        </h2>

        <p className="mt-3 text-center text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
          {formatRemaining(remaining)}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          계속 사용하시려면 로그인을 연장해 주십시오. 연장하지 않으면 위 시간이 지난 뒤
          자동으로 로그아웃되며, <strong>저장하지 않은 편집 내용은 사라집니다.</strong>
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onExtend}
            disabled={extend.isPending}
            className="flex-1 rounded bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {extend.isPending ? '연장하는 중…' : '로그인 연장'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={logout.isPending}
            className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            지금 로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
