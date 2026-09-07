/**
 * 서버 관리 화면 — 재시작 예고와 접속자 목록.
 *
 * 접속자 판정은 "최근 5분 이내에 활동한 사람"이라는 근사치다(㉳ 회신). 브라우저를 그냥 닫은
 * 사람은 최대 5분 동안 남으므로, 이 목록만 믿고 재시작하지 말고 예고를 함께 걸어야 한다.
 */
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { DEFAULT_RESTART_NOTICE_MESSAGE, SERVER_NOTICE_WARNING_MS } from '@sam/shared';
import { useMe } from '../lib/auth';
import {
  useActiveServerNotice,
  useActiveSessions,
  useCancelServerNotice,
  useCreateServerNotice,
  useNoticeRemaining,
  useServerNoticeHistory,
} from '../lib/serverNotice';
import { formatNoticeRemaining, isNoticeVisible } from '../lib/noticeCountdown';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/** datetime-local 입력이 쓰는 형식(로컬 시간대, 초 없음)으로 바꾼다. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminServerPage() {
  const me = useMe();
  const isAdmin = me.data?.globalRole === 'ADMIN';

  const activeQ = useActiveServerNotice();
  const remaining = useNoticeRemaining();
  const sessions = useActiveSessions(isAdmin);
  const history = useServerNoticeHistory(isAdmin);
  const create = useCreateServerNotice();
  const cancel = useCancelServerNotice();

  const [scheduledLocal, setScheduledLocal] = useState('');
  const [message, setMessage] = useState(DEFAULT_RESTART_NOTICE_MESSAGE);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (me.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (!me.data) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-600">ADMIN 권한이 필요합니다.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 프로젝트 목록
        </Link>
      </main>
    );
  }

  const notice = activeQ.data?.notice ?? null;
  const sessionsData = sessions.data;

  /**
   * 빠른 버튼. 기준은 서버 시계다.
   *
   * 관리자 PC 시계가 어긋나 있으면 "5분 뒤"가 실제로는 8분 뒤가 되어, 사용자 화면의
   * 카운트다운과 관리자가 의도한 시각이 어긋난다.
   */
  function quickPick(minutes: number) {
    const serverNowMs = activeQ.data
      ? Date.parse(activeQ.data.serverNow) + (Date.now() - activeQ.dataUpdatedAt)
      : Date.now();
    setScheduledLocal(toLocalInputValue(new Date(serverNowMs + minutes * 60 * 1000)));
  }

  async function handleCreate() {
    if (!scheduledLocal) {
      toast.error('재시작 예정 시각을 정해 주십시오.');
      return;
    }
    try {
      await create.mutateAsync({
        kind: 'RESTART',
        message,
        scheduledAt: new Date(scheduledLocal).toISOString(),
      });
      toast.success('재시작 예고를 등록했습니다.');
      setScheduledLocal('');
      setMessage(DEFAULT_RESTART_NOTICE_MESSAGE);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancel.mutateAsync(id);
      toast.success('재시작 예고를 취소했습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">서버 관리</h1>

      {/* 1. 예고 카드 */}
      <section className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">재시작 예고</h2>

        {notice ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              예정 시각: <strong>{new Date(notice.scheduledAt).toLocaleString()}</strong>
              {remaining && (
                <span className="ml-2 tabular-nums text-rose-600">
                  ({formatNoticeRemaining(remaining.signedRemainingMs)})
                </span>
              )}
            </p>
            <p className="text-slate-600 dark:text-slate-400">{notice.message}</p>
            {/*
              사용자 쪽에 언제 보이는지 밝힌다. 예정 시각을 5분보다 멀리 잡으면 등록 직후
              사용자 화면이 조용한데, 그것이 정상인지 결함인지 관리자가 알 방법이 없었다.
            */}
            {remaining &&
              (isNoticeVisible(remaining.signedRemainingMs, SERVER_NOTICE_WARNING_MS) ? (
                <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                  지금 사용자 화면에 표시되고 있습니다.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  사용자 화면에는{' '}
                  <strong>
                    {new Date(
                      Date.parse(notice.scheduledAt) - SERVER_NOTICE_WARNING_MS,
                    ).toLocaleTimeString()}
                    부터
                  </strong>{' '}
                  표시됩니다.
                </p>
              ))}
            <p className="text-xs text-slate-500">
              {notice.createdByName} 이(가) {new Date(notice.createdAt).toLocaleString()} 에 등록
            </p>
            <button
              type="button"
              onClick={() => void handleCancel(notice.id)}
              disabled={cancel.isPending}
              className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              {cancel.isPending ? '취소하는 중…' : '예고 취소'}
            </button>
            <p className="text-xs text-slate-500">
              시각을 바꾸려면 지금 예고를 취소한 뒤 다시 등록해 주십시오.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">빠른 선택</span>
              {[5, 10, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => quickPick(m)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {m}분 뒤
                </button>
              ))}
            </div>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              재시작 예정 시각
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              안내 문구
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={create.isPending}
              className="rounded bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {create.isPending ? '등록하는 중…' : '예고 등록'}
            </button>
            {/* 등록하기 전에 동작을 알린다. 확정명세 ⑤ 의 사용자 쪽 사양 그대로다. */}
            <p className="text-xs leading-relaxed text-slate-500">
              사용자 화면에는 <strong>예정 시각 5분 전부터</strong> 팝업이 표시됩니다.
              "확인"으로 닫아도 1분마다 다시 뜨고, 예정 시각이 지나도 계속 표시됩니다.
            </p>
          </div>
        )}
      </section>

      {/* 2. 접속자 목록 */}
      <section className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            현재 접속자 {sessionsData ? `(${sessionsData.users.length}명)` : ''}
          </h2>
          <button
            type="button"
            onClick={() => void sessions.refetch()}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            새로고침
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500">
          최근 5분 이내에 활동한 사람입니다. 브라우저를 그냥 닫은 사람은 최대 5분 동안 남습니다.
        </p>

        {sessionsData && sessionsData.users.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">접속 중인 사람이 없습니다.</p>
        )}

        {sessionsData && sessionsData.users.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">이름</th>
                <th className="py-1">마지막 활동</th>
                <th className="py-1">접속 IP</th>
              </tr>
            </thead>
            <tbody>
              {sessionsData.users.map((u) => (
                <tr key={u.userId} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-1.5">
                    {u.displayName}
                    <span className="ml-1 text-xs text-slate-500">({u.username})</span>
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {new Date(u.lastSeenAt).toLocaleTimeString()}
                    <span className="ml-1 text-xs text-slate-500">
                      ({minutesAgoLabel(u.lastSeenAt, sessionsData.serverNow)})
                    </span>
                  </td>
                  <td className="py-1.5 tabular-nums text-xs">
                    {u.ips.length > 0 ? u.ips.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 3. 지난 예고 기록 */}
      <section className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-sm font-bold text-slate-800 dark:text-slate-100"
        >
          지난 예고 기록 {historyOpen ? '▾' : '▸'}
        </button>

        {historyOpen && history.data && (
          <ul className="mt-3 space-y-2 text-xs">
            {history.data.length === 0 && <li className="text-slate-500">기록이 없습니다.</li>}
            {history.data.map((n) => (
              <li key={n.id} className="border-t border-slate-100 pt-2 dark:border-slate-700">
                <span className="tabular-nums">{new Date(n.scheduledAt).toLocaleString()}</span>
                <span className="ml-2 text-slate-500">
                  {n.canceledAt ? '취소됨' : '적용됨'} · {n.createdByName}
                </span>
                <p className="mt-0.5 text-slate-600 dark:text-slate-400">{n.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link to="/" className="mt-5 inline-block text-sm text-sky-600 underline">
        ← 프로젝트 목록
      </Link>
    </main>
  );
}

/** 서버 시각을 기준으로 "몇 분 전"을 만든다. 관리자 PC 시계가 어긋나 있어도 흔들리지 않는다. */
function minutesAgoLabel(lastSeenAt: string, serverNow: string): string {
  const diffMs = Date.parse(serverNow) - Date.parse(lastSeenAt);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes <= 0) return '방금';
  return `${minutes}분 전`;
}
