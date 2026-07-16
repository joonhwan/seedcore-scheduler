import { useEffect } from 'react';
import type { BarChangeProposal } from '../lib/ganttTypes';

interface BarChangeConfirmDialogProps {
  proposal: BarChangeProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

function fmt(v: string | null): string {
  return v ?? '—';
}

export default function BarChangeConfirmDialog({
  proposal,
  onConfirm,
  onCancel,
}: BarChangeConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  const { node, newStartAt, newEndAt, affectedGroups } = proposal;
  const beforeStart = node.startAt;
  const beforeEnd = node.endAt;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in-50 zoom-in-95 duration-100">
      <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          일정 변경 확인
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          드래그로 변경한 내용입니다. 적용하려면 Enter, 취소하려면 ESC 를 누르세요.
        </p>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={node.title}>
            {node.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono">
            <span className="text-rose-500 line-through">
              {fmt(beforeStart)} ~ {fmt(beforeEnd)}
            </span>
            <span className="text-slate-400">➔</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {newStartAt} ~ {newEndAt}
            </span>
          </div>
        </div>

        {affectedGroups.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              함께 조정되는 상위 그룹 ({affectedGroups.length})
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {affectedGroups.map((g) => (
                <li key={g.id} className="rounded bg-violet-50 px-2 py-1 text-[11px] dark:bg-violet-950/30">
                  <span className="font-medium text-violet-800 dark:text-violet-300 truncate" title={g.title}>
                    {g.title}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-rose-500 line-through">
                      {fmt(g.beforeStart)} ~ {fmt(g.beforeEnd)}
                    </span>
                    <span className="text-slate-400">➔</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {fmt(g.afterStart)} ~ {fmt(g.afterEnd)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            취소 (ESC)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            적용 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
