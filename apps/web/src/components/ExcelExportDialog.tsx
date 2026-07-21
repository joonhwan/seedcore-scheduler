import { useEffect, useState } from 'react';
import type { NodeTreeItem } from '@sam/shared';
import {
  UNIT_LABELS,
} from '../lib/ganttExport';
import type { TimelineUnit } from '../lib/ganttLayout';
import type { Theme } from '../lib/theme';
import { toast } from '../lib/toast';

const UNITS: TimelineUnit[] = ['day', 'week', 'month', 'quarter'];

interface ExcelExportDialogProps {
  items: NodeTreeItem[];
  currentUnit: TimelineUnit;
  currentTheme: Theme;
  projectName: string;
  onClose: () => void;
}

export default function ExcelExportDialog({
  items,
  currentUnit,
  projectName,
  onClose,
}: ExcelExportDialogProps) {
  const [unit, setUnit] = useState<TimelineUnit>(currentUnit);
  const [theme, setTheme] = useState<Theme>('light'); // 기본 Light 테마 추천
  const [includeOutline, setIncludeOutline] = useState<boolean>(false); // 기본 미선택
  const [busy, setBusy] = useState(false);

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

  const handleExport = async () => {
    setBusy(true);
    try {
      const { exportGanttExcel } = await import('../lib/exportGanttExcel');
      await exportGanttExcel({
        projectName,
        items,
        unit,
        theme,
        includeOutline,
      });
      toast.success('엑셀 간트차트(.xlsx)가 다운로드되었습니다.');
      onClose();
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : '엑셀 내보내기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          엑셀 간트차트 내보내기 (.xlsx)
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          선택한 단위에 맞춰 워크시트에 셀 배경색 간트 차트가 구성됩니다. (전/후 1단위 여유 포함)
        </p>

        <div className="mt-4 space-y-4">
          {/* 눈금 단위 선택 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              시간 단위
            </div>
            <div className="flex gap-1">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    unit === u
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {UNIT_LABELS[u]}
                </button>
              ))}
            </div>
          </div>

          {/* 테마 선택 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              엑셀 색상 테마
            </div>
            <div className="flex gap-1">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    theme === t
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t === 'light' ? 'Light (기본 밝은 테마)' : 'Dark (어두운 테마)'}
                </button>
              ))}
            </div>
          </div>

          {/* 레벨별 윤곽(접기/펼치기) 옵션 */}
          <div className="rounded border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeOutline}
                onChange={(e) => setIncludeOutline(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                엑셀 윤곽(Outline) 레벨별 접기 기능 포함
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80">
                베타
              </span>
            </label>
            <p className="mt-1 pl-6 text-[11px] text-slate-500 dark:text-slate-400">
              엑셀에서 하위 일정을 레벨 단추(1,2,3..)로 접고 펼칠 수 있는 윤곽 속성을 추가합니다.
            </p>
          </div>

          {/* 안내 메세지 */}
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
            📌 선택한 단위({UNIT_LABELS[unit]})에 맞게 엑셀 컬럼이 생성되며, 프로젝트 시작 전과 종료 후에 <b>1 {UNIT_LABELS[unit]}</b>의 여유 기간이 포함됩니다.
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
            disabled={busy}
            className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          >
            {busy ? '엑셀 생성 중…' : '엑셀 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
