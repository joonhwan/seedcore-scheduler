/**
 * 서버 재시작 예고 창.
 *
 * 예정 시각 5분 전부터 떠서 남은 시간을 센다. "확인"으로 닫아도 1분마다 다시 뜬다
 * (확정명세 ⑤). 예정 시각이 지난 뒤에도 "곧 재시작됩니다"로 바꿔 계속 알린다 — 재시작이
 * 몇 분 늦어지는 사이에 팝업이 사라지면 사용자가 편집을 다시 시작해 작업을 잃기 때문이다.
 *
 * 저장 안내는 편집 중인지 보지 않고 항상 붙인다. 편집 상태를 아는 화면이 프로젝트 상세
 * 하나뿐이라, 조건을 걸면 나머지 화면에서 조용해져 안내가 반쪽이 된다(설계 문서 §4.4).
 */
import { useEffect, useState } from 'react';
import { SERVER_NOTICE_WARNING_MS } from '@sam/shared';
import { useNoticeRemaining } from '../lib/serverNotice';
import { formatNoticeRemaining, minuteMark, shouldShowNotice } from '../lib/noticeCountdown';

export default function ServerNoticeDialog() {
  const state = useNoticeRemaining();
  // 어느 예고를 어느 구간에서 닫았는지. 예고가 바뀌면 id 가 달라져 저절로 초기화된다.
  const [dismissed, setDismissed] = useState<{ id: string; mark: number } | null>(null);

  const noticeId = state?.notice.id ?? null;
  useEffect(() => {
    setDismissed((prev) => (prev && prev.id === noticeId ? prev : null));
  }, [noticeId]);

  if (!state) return null;

  const { notice, signedRemainingMs } = state;
  const dismissedMark = dismissed && dismissed.id === notice.id ? dismissed.mark : null;

  const show = shouldShowNotice({
    signedRemainingMs,
    warningMs: SERVER_NOTICE_WARNING_MS,
    dismissedMark,
  });
  if (!show) return null;

  const onConfirm = () =>
    setDismissed({ id: notice.id, mark: minuteMark(signedRemainingMs) });

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-notice-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <h2
          id="server-notice-title"
          className="text-sm font-bold text-slate-800 dark:text-slate-100"
        >
          서버가 곧 재시작됩니다
        </h2>

        <p className="mt-3 text-center text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
          {formatNoticeRemaining(signedRemainingMs)}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {notice.message}
        </p>

        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
          저장하지 않은 변경이 있으면 지금 저장해 주십시오.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
