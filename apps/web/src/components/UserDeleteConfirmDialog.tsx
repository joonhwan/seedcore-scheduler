import { useState } from 'react';

/**
 * 계정 완전 삭제 확인.
 *
 * **아이디를 직접 입력해야 버튼이 열린다.** 되돌릴 수 없는 작업이라 window.confirm 한 번으로
 * 넘기지 않는다. 활성·비활성 토글이나 비밀번호 리셋과 달리 이것은 복구할 방법이 없다.
 */
export default function UserDeleteConfirmDialog({
  username,
  displayName,
  busy,
  onConfirm,
  onClose,
}: {
  username: string;
  displayName: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matched = typed.trim() === username;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-rose-700 dark:text-rose-300">
          계정을 영구히 삭제합니다
        </h2>

        <p className="mt-3 text-sm font-medium">
          {username} <span className="text-slate-500">({displayName})</span>
        </p>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          이 작업은 되돌릴 수 없습니다. 계정과 로그인 세션이 사라지며, 감사 기록에는 행위자 없이
          남습니다.
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            계속하려면 아이디를 입력하십시오
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matched || busy}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
