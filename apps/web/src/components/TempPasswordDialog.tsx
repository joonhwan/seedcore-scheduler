import { useState } from 'react';

export default function TempPasswordDialog({
  displayName,
  temporaryPassword,
  onClose,
}: {
  displayName: string;
  temporaryPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">임시 비밀번호 발급</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium">{displayName}</span> 의 임시 비밀번호입니다. <br />
          <strong className="text-rose-600 dark:text-rose-400">
            이 값은 지금만 표시됩니다.
          </strong>{' '}
          닫으면 다시 볼 수 없습니다.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <code className="flex-1 break-all rounded border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800">
            {temporaryPassword}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700"
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          첫 로그인 시 비밀번호 변경이 강제됩니다. 모든 기존 세션이 폐기되었습니다.
        </p>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
