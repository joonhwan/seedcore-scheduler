import { useEffect, useMemo, useState } from 'react';
import type { NodeTreeItem } from '@sam/shared';
import {
  collapsedIdsForDepth,
  computeExportSize,
  depthStepCount,
  UNIT_LABELS,
  EXPORT_MAX_EDGE,
  EXPORT_PIXEL_RATIO,
  DEFAULT_LABEL_WIDTH,
  type DepthOption,
} from '../lib/ganttExport';
import { exportGanttImage } from '../lib/exportGanttImage';
import { todayUtc, type TimelineUnit } from '../lib/ganttLayout';
import { formatYmd } from '../lib/ganttMath';
import type { Theme } from '../lib/theme';
import { toast } from '../lib/toast';

const UNITS: TimelineUnit[] = ['day', 'week', 'month', 'quarter'];

interface GanttExportDialogProps {
  items: NodeTreeItem[];
  currentUnit: TimelineUnit;
  currentTheme: Theme;
  projectName: string;
  onClose: () => void;
}

// 화면 Timeline 과 같은 라벨 폭(localStorage)을 읽는다.
function readLabelWidth(): number {
  const saved =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('sam_gantt_label_width')
      : null;
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) return parsed;
  }
  return DEFAULT_LABEL_WIDTH;
}

export default function GanttExportDialog({
  items,
  currentUnit,
  currentTheme,
  projectName,
  onClose,
}: GanttExportDialogProps) {
  const [unit, setUnit] = useState<TimelineUnit>(currentUnit);
  const [depth, setDepth] = useState<DepthOption>('all');
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [busy, setBusy] = useState(false);

  const labelWidth = useMemo(() => readLabelWidth(), []);
  const stepCount = useMemo(() => depthStepCount(items), [items]);
  const collapsedIds = useMemo(
    () => collapsedIdsForDepth(items, depth),
    [items, depth],
  );
  const size = useMemo(
    () =>
      computeExportSize({
        items,
        collapsedIds,
        unit,
        labelWidth,
        pixelRatio: EXPORT_PIXEL_RATIO,
        maxEdge: EXPORT_MAX_EDGE,
      }),
    [items, collapsedIds, unit, labelWidth],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const canExport = size.hasContent && !size.exceedsLimit && !busy;

  const handleExport = async () => {
    if (!canExport) return;
    setBusy(true);
    try {
      await exportGanttImage({
        items,
        unit,
        collapsedIds,
        theme,
        projectName,
        dateYmd: formatYmd(todayUtc()),
        labelWidth,
        pixelRatio: EXPORT_PIXEL_RATIO,
      });
      toast.success('간트 이미지를 내려받았습니다.');
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : '이미지 내보내기에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  // 깊이 선택지: 전체 + 1..stepCount 단계
  const depthOptions: { value: DepthOption; label: string }[] = [
    { value: 'all', label: '전체' },
    ...Array.from({ length: Math.max(0, stepCount) }, (_, i) => ({
      value: (i + 1) as DepthOption,
      label: `${i + 1}단계`,
    })),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          이미지로 내보내기 (PNG)
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          선택한 깊이까지 펼쳐지고, 오늘 날짜선은 빠집니다.
        </p>

        <div className="mt-4 space-y-4">
          {/* 눈금 단위 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              눈금 단위
            </div>
            <div className="flex gap-1">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    unit === u
                      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {UNIT_LABELS[u]}
                </button>
              ))}
            </div>
          </div>

          {/* 펼침 깊이 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              펼침 깊이
            </div>
            <select
              value={String(depth)}
              onChange={(e) =>
                setDepth(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {depthOptions.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 테마 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              테마
            </div>
            <div className="flex gap-1">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    theme === t
                      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t === 'light' ? '라이트' : '다크'}
                </button>
              ))}
            </div>
          </div>

          {/* 예상 크기 / 경고 */}
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
            {!size.hasContent ? (
              <span className="text-amber-600 dark:text-amber-400">
                내보낼 일정(날짜)이 없습니다.
              </span>
            ) : (
              <div className="space-y-1">
                <div className="text-slate-600 dark:text-slate-300">
                  예상 크기: 약 <b>{size.scaledWidth.toLocaleString()}</b> ×{' '}
                  <b>{size.scaledHeight.toLocaleString()}</b> px (해상도 2배 · 표시{' '}
                  {size.rowCount}행)
                </div>
                {size.exceedsLimit && (
                  <div className="text-rose-600 dark:text-rose-400">
                    이미지가 너무 큽니다(한 변 {EXPORT_MAX_EDGE.toLocaleString()}px
                    초과). 눈금을 더 굵게 하거나 펼침 깊이를 줄여 주세요.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            취소 (ESC)
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {busy ? '내보내는 중…' : '내보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
