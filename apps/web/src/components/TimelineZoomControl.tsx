// 간트 확대·축소 도구막대. 프로젝트 상세(Tree 뷰)와 Timeline 뷰가 같은 것을 쓴다.
// 슬라이더 눈금 계산을 두 화면에 복사해 두면 한쪽만 고치는 사고가 나므로 한 곳에 모았다.
import {
  ppdToSlider,
  sliderToPpd,
  ppdToPercentExact,
  percentToPpd,
  SLIDER_MIN,
  SLIDER_MAX,
} from '../lib/ganttZoom';

const BUTTON_CLASS =
  'flex h-6 items-center justify-center rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors';

interface Props {
  /** 현재 배율(퍼센트, 반올림 전). 일 단위 기본 배율 36px/일 이 100% 다. */
  percent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPercentChange: (percent: number) => void;
  onFitToScreen: () => void;
  onJumpToday: () => void;
}

export function TimelineZoomControl({
  percent,
  onZoomIn,
  onZoomOut,
  onPercentChange,
  onFitToScreen,
  onJumpToday,
}: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
      <button
        type="button"
        onClick={onZoomOut}
        title="축소 (단축키: -)"
        className={`${BUTTON_CLASS} w-6 text-sm`}
      >
        －
      </button>
      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={1}
        value={ppdToSlider(percentToPpd(percent))}
        onChange={(e) => onPercentChange(ppdToPercentExact(sliderToPpd(Number(e.target.value))))}
        title="배율 조절"
        aria-label="간트 배율"
        className="h-6 w-24 cursor-pointer accent-sky-600 dark:accent-sky-500"
      />
      <button
        type="button"
        onClick={onZoomIn}
        title="확대 (단축키: +, =)"
        className={`${BUTTON_CLASS} w-6 text-sm`}
      >
        ＋
      </button>
      {/* tabular-nums 로 자릿수가 바뀌어도 옆 버튼이 밀리지 않게 한다. */}
      <span
        className="w-11 select-none text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300"
        title="현재 배율 (일 단위 기본 배율이 100%)"
      >
        {Math.round(percent)}%
      </span>
      <button
        type="button"
        onClick={onFitToScreen}
        title="화면에 꽉 차게 맞춤"
        className={`${BUTTON_CLASS} px-1.5`}
      >
        화면맞춤
      </button>
      <button
        type="button"
        onClick={onJumpToday}
        title="오늘 날짜 위치로 스크롤"
        className={`${BUTTON_CLASS} px-1.5`}
      >
        오늘
      </button>
    </div>
  );
}
