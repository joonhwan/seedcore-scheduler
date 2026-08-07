import React from 'react';
import type { DelayStatus } from '@sam/shared';

interface ProgressBarWithExpectedProps {
  actualProgress: number | null;
  expectedProgress: number | null;
  status?: DelayStatus;
  height?: string;
  showLabels?: boolean;
  className?: string;
}

export default function ProgressBarWithExpected({
  actualProgress,
  expectedProgress,
  status = 'ON_TRACK',
  height = 'h-2.5',
  showLabels = false,
  className = '',
}: ProgressBarWithExpectedProps) {
  const actual = actualProgress ?? 0;
  // 시작 전(0%) 또는 종료 후(100%)에는 세로선을 그리지 않고, 일정 기간 내(0 < expected < 100) 일 때만 렌더링
  const hasExpected = expectedProgress !== null && expectedProgress !== undefined && expectedProgress > 0 && expectedProgress < 100;

  let barColorClass = 'bg-blue-600 dark:bg-blue-500';
  let actualLabelClass = 'font-mono text-slate-700 dark:text-slate-300 font-medium';
  if (status === 'CRITICAL') {
    barColorClass = 'bg-gradient-to-r from-red-600 to-rose-500 animate-pulse';
    actualLabelClass = 'font-mono text-red-600 dark:text-red-400 font-bold';
  } else if (status === 'WARNING') {
    barColorClass = 'bg-gradient-to-r from-amber-600 to-yellow-500';
    actualLabelClass = 'font-mono text-amber-700 dark:text-amber-300 font-semibold';
  } else if (status === 'SLIGHT') {
    actualLabelClass = 'font-mono text-yellow-700 dark:text-yellow-400 font-medium';
  } else if (actual >= 100) {
    barColorClass = 'bg-emerald-600 dark:bg-emerald-500';
    actualLabelClass = 'font-mono text-emerald-600 dark:text-emerald-400 font-medium';
  }

  const tooltipText = hasExpected
    ? `실제: ${actual}% | 예상: ${expectedProgress}% ${
        status === 'CRITICAL' || status === 'WARNING' || status === 'SLIGHT'
          ? `(${expectedProgress! - actual}% 지연)`
          : ''
      }`
    : `실제: ${actual}%`;

  return (
    <div className={`w-full flex flex-col gap-0.5 ${className}`} title={tooltipText}>
      {showLabels && (
        <div className="flex justify-between items-center text-[11px]">
          <span className={actualLabelClass}>실제 {actual >= 100 ? '완료' : `${actual}%`}</span>
          {hasExpected && (
            <span className="font-mono text-slate-400">예상 {expectedProgress}%</span>
          )}
        </div>
      )}

      <div className={`relative w-full ${height} bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-visible`}>
        {/* 실제 진척률 바 */}
        <div
          className={`${height} rounded-full transition-all duration-300 ${barColorClass}`}
          style={{ width: `${Math.min(100, Math.max(0, actual))}%` }}
        />

        {/* 예상 진척률 세로 핀/마커 */}
        {hasExpected && (
          <div
            className="absolute top-[-3px] bottom-[-3px] w-[3px] bg-slate-900 dark:bg-slate-100 rounded-full z-10 shadow-sm transition-all"
            style={{ left: `calc(${Math.min(100, Math.max(0, expectedProgress!))}% - 1px)` }}
            title={`오늘 기준 예상 진척률: ${expectedProgress}%`}
          >
            {/* 마커 팁 아이콘 */}
            <div className="absolute -top-1 -left-[3px] w-2.5 h-1.5 bg-slate-900 dark:bg-slate-100 rounded-t-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
