import { useState, useEffect } from 'react';

interface BulkShiftDatesDialogProps {
  selectedCount: number; // 다중 선택된 총 노드 수
  targetItemCount: number; // 실제 이동될 ITEM 노드 수
  hasGroup: boolean; // 그룹 포함 여부
  onCancel: () => void;
  onConfirm: (deltaDays: number) => void;
}

export default function BulkShiftDatesDialog({
  selectedCount,
  targetItemCount,
  hasGroup,
  onCancel,
  onConfirm,
}: BulkShiftDatesDialogProps) {
  // 'forward' (+N일, 연기/뒤로), 'backward' (-N일, 당김/앞으로)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [daysInput, setDaysInput] = useState<string>('1');

  const daysNum = Math.max(1, parseInt(daysInput, 10) || 1);
  const deltaDays = direction === 'forward' ? daysNum : -daysNum;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(deltaDays);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm, deltaDays]);

  const handleConfirm = () => {
    onConfirm(deltaDays);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in-50 zoom-in-95 duration-100">
      <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          선택 일정 기간 조정
        </h3>

        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <p>
            선택한 <b>{selectedCount}개</b> 항목 중 <b>{targetItemCount}개</b> 일자의 기간을 이동합니다.
          </p>
          {hasGroup && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded p-2 mt-1">
              ⓘ 선택 대상에 그룹 노드가 포함되어 있습니다. 그룹 하위에 속한 일정 항목의 기간이 함께 조정됩니다.
            </p>
          )}
        </div>

        {/* 이동 설정 영역 */}
        <div className="mt-5 space-y-4 rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              이동 방향
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('forward')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold border transition-all ${
                  direction === 'forward'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span>뒤로 이동 (연기)</span>
                <span className="text-[10px] opacity-75">+N일</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('backward')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold border transition-all ${
                  direction === 'backward'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/60 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span>앞으로 이동 (당김)</span>
                <span className="text-[10px] opacity-75">-N일</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="shift-days-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              이동 일수 (Offset)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="shift-days-input"
                type="number"
                min={1}
                max={365}
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-medium">일</span>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700/60 pt-2.5">
            <span className="font-medium text-slate-700 dark:text-slate-300">적용 예상: </span>
            시작일과 종료일이 각각{' '}
            <b className="text-indigo-600 dark:text-indigo-400">
              {direction === 'forward' ? `${daysNum}일 뒤로 (연기)` : `${daysNum}일 앞으로 (당김)`}
            </b>{' '}
            이동합니다.
          </div>
        </div>

        {/* 액션 버튼 */}
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
            onClick={handleConfirm}
            className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            확인 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
