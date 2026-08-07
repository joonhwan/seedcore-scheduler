import React from 'react';
import { getDelayStatusTooltip, type DelayStatus } from '@sam/shared';

interface DelayStatusBadgeProps {
  status: DelayStatus;
  delayGap?: number;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function DelayStatusBadge({
  status,
  delayGap,
  showDetails = true,
  size = 'md',
  className = '',
}: DelayStatusBadgeProps) {
  if (status === 'UNKNOWN') {
    return (
      <span className={`inline-flex items-center text-slate-400 text-xs ${className}`}>
        -
      </span>
    );
  }

  const gapText = delayGap !== undefined && delayGap > 0 ? `${delayGap}% 지연` : '';

  let sizeClasses = 'px-2 py-0.5 text-xs';
  if (size === 'sm') sizeClasses = 'px-2 py-0.5 text-xs';
  if (size === 'lg') sizeClasses = 'px-2.5 py-1 text-sm';

  const tooltipText = getDelayStatusTooltip(status, delayGap);

  switch (status) {
    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 ${sizeClasses} ${className}`}
          title={tooltipText}
        >
          {/* 눈길을 끄는 펄스 핑 애니메이션 */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span>🚨 {showDetails && gapText ? `지연 (${gapText})` : '심각 지연'}</span>
        </span>
      );

    case 'WARNING':
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 ${sizeClasses} ${className}`}
          title={tooltipText}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
          <span>⚠️ {showDetails && gapText ? `주의 (${gapText})` : '주의'}</span>
        </span>
      );

    case 'SLIGHT':
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20 ${sizeClasses} ${className}`}
          title={tooltipText}
        >
          <span>📉 {showDetails && gapText ? gapText : '소폭 지연'}</span>
        </span>
      );

    case 'ON_TRACK':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 ${sizeClasses} ${className}`}
          title={tooltipText}
        >
          <span>✅ 정상</span>
        </span>
      );
  }
}
