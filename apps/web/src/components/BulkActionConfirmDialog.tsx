import { useEffect } from 'react';

export type BulkCompleteMode = 'items-only' | 'include-descendants';

interface BulkActionConfirmDialogProps {
  action: 'delete' | 'complete';
  count: number; // 선택한 노드 수(표시용)
  hasGroup: boolean; // complete 시 GROUP 포함 여부
  onCancel: () => void;
  onConfirm: (mode: BulkCompleteMode) => void;
}

export default function BulkActionConfirmDialog({
  action,
  count,
  hasGroup,
  onCancel,
  onConfirm,
}: BulkActionConfirmDialogProps) {
  const isDelete = action === 'delete';
  const groupChoice = action === 'complete' && hasGroup;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 기본 확정: 삭제 / 완료(그룹 포함이면 하위 모두, 아니면 선택 ITEM)
        onConfirm(groupChoice ? 'include-descendants' : 'items-only');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm, groupChoice]);

  const cancelBtn = (
    <button
      type="button"
      onClick={onCancel}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
    >
      취소 (ESC)
    </button>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in-50 zoom-in-95 duration-100">
      <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {isDelete ? (
          <>
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
              선택 일정 삭제
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              선택한 <b>{count}개</b> 일정을 <b>하위 항목을 포함하여 영구 삭제</b>합니다.
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              {cancelBtn}
              <button
                type="button"
                onClick={() => onConfirm('items-only')}
                className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
              >
                삭제 (Enter)
              </button>
            </div>
          </>
        ) : groupChoice ? (
          <>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              100% 완료 처리
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              선택 항목에 <b>그룹</b>이 포함되어 있습니다. 그룹은 진행률을 직접 설정할 수 없습니다.
              어떻게 처리할까요?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onConfirm('include-descendants')}
                className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                그룹 하위 모든 일정을 100% (Enter)
              </button>
              <button
                type="button"
                onClick={() => onConfirm('items-only')}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                선택한 일정(ITEM)만 100%
              </button>
              {cancelBtn}
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              100% 완료 처리
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              선택한 <b>{count}개</b> 일정을 100% 완료로 설정합니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              {cancelBtn}
              <button
                type="button"
                onClick={() => onConfirm('items-only')}
                className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                100% 완료 (Enter)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
