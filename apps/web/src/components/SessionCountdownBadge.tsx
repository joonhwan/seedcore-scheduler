/**
 * 헤더에 붙는 남은 로그인 시간 표시.
 *
 * 여유가 있을 때(30분 초과)는 아무것도 그리지 않는다. 12시간짜리 세션의 남은 시간을 온종일
 * 띄워 봐야 읽을 사람이 없고, 정작 필요한 순간에 눈에 띄지 않는다. 창이 뜨기 전에 미리
 * 알아차릴 수 있는 구간에서만 나타난다.
 */
import { useSessionRemaining } from '../lib/session';
import { formatRemaining } from '../lib/sessionCountdown';

/** 이 시간 이하로 남았을 때부터 표시한다. */
const SHOW_BELOW_MS = 30 * 60 * 1000;

export default function SessionCountdownBadge() {
  const remaining = useSessionRemaining();

  if (remaining === null || remaining <= 0 || remaining > SHOW_BELOW_MS) return null;

  const urgent = remaining <= 10 * 60 * 1000;

  return (
    <span
      title="남은 로그인 시간입니다. 만료 10분 전에 연장 창이 뜹니다."
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        urgent
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
