import React from 'react';
import type { DelayStatus } from '@sam/shared';

interface ProgressPercentBadgeProps {
  progress: number | null;
  status?: DelayStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export default function ProgressPercentBadge({
  progress,
  status = 'ON_TRACK',
  size = 'sm',
  className = '',
}: ProgressPercentBadgeProps) {
  if (progress === null || progress === undefined) {
    return (
      <span
        className={`inline-flex items-center justify-center font-mono rounded px-1 py-0.5 text-[10px] text-slate-400 dark:text-slate-500 ${className}`}
      >
        -%
      </span>
    );
  }

  const roundedProgress = Math.round(progress);
  const isCompleted = roundedProgress >= 100;
  const labelText = isCompleted ? '완료' : `${roundedProgress}%`;
  const isMono = !isCompleted;

  let sizeClasses = 'px-1.5 py-0.5 text-[11px]';
  if (size === 'md') sizeClasses = 'px-2 py-0.5 text-xs';

  const fontClass = isMono ? 'font-mono' : 'font-medium';

  switch (status) {
    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center justify-center ${fontClass} font-bold rounded bg-red-500/20 text-red-600 dark:text-red-300 border border-red-500/40 shadow-sm ${sizeClasses} ${className}`}
          title={`지연 상태: 심각 지연 (${isCompleted ? '100% 완료' : `${roundedProgress}%`})`}
        >
          {labelText}
        </span>
      );

    case 'WARNING':
      return (
        <span
          className={`inline-flex items-center justify-center ${fontClass} font-semibold rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 ${sizeClasses} ${className}`}
          title={`지연 상태: 주의 (${isCompleted ? '100% 완료' : `${roundedProgress}%`})`}
        >
          {labelText}
        </span>
      );

    case 'SLIGHT':
      return (
        <span
          className={`inline-flex items-center justify-center ${fontClass} font-medium rounded bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30 ${sizeClasses} ${className}`}
          title={`지연 상태: 소폭 지연 (${isCompleted ? '100% 완료' : `${roundedProgress}%`})`}
        >
          {labelText}
        </span>
      );

    case 'ON_TRACK':
    default:
      if (isCompleted) {
        return (
          <span
            className={`inline-flex items-center justify-center font-normal text-[10px] text-slate-400 dark:text-slate-500/80 opacity-70 ${className}`}
            title="100% 완료"
          >
            완료
          </span>
        );
      }
      return (
        <span
          className={`inline-flex items-center justify-center ${fontClass} text-[11px] text-slate-500 dark:text-slate-400 ${className}`}
          title={`정상 진행 중 (${roundedProgress}%)`}
        >
          {labelText}
        </span>
      );
  }
}
