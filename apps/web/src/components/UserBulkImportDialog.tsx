import { useState } from 'react';
import { PASSWORD_MIN_LENGTH, validatePassword, type BulkImportResult } from '@sam/shared';
import { useBulkImportUsers } from '../lib/users';
import { ApiError } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';

const SAMPLE = `운영기술센터
	기구완성팀
		- gigu01, 김민준-기구완성팀
		- gigu02, 이서연-기구완성팀
	- center01, 정하준-센터장
구매팀
	- gumae01, 한지호-구매팀`;

export default function UserBulkImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [text, setText] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [skipExisting, setSkipExisting] = useState(false);
  const [preview, setPreview] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const bulk = useBulkImportUsers();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  /** 미리보기를 새로 받는다. */
  async function loadPreview(): Promise<void> {
    setError(null);
    try {
      const r = await bulk.mutateAsync({
        text,
        // 미리보기 단계에서는 비밀번호를 쓰지 않으므로 최소 길이만 채워 보낸다.
        initialPassword:
          initialPassword.length >= PASSWORD_MIN_LENGTH
            ? initialPassword
            : 'x'.repeat(PASSWORD_MIN_LENGTH),
        dryRun: true,
        skipExisting,
      });
      setPreview(r);
    } catch (err) {
      setPreview(null);
      setError(apiErrorMessage(err));
    }
  }

  async function handleApply(): Promise<void> {
    setError(null);
    setNotice(null);
    if (!preview) return;

    // 공통 비밀번호라 검사 대상 아이디가 여럿이다. validatePassword 는 username 이 필수이고
    // "아이디를 비밀번호에 넣지 말 것"까지 보므로, 만들 사람 전부에 대해 확인한다.
    // 서버도 같은 검사를 다시 한다.
    const policy = preview.usersToCreate.reduce<ReturnType<typeof validatePassword>>(
      (found, u) => found ?? validatePassword(initialPassword, u.username),
      null,
    );
    if (policy) {
      setError(
        policy === 'TOO_SHORT'
          ? `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`
          : policy === 'INSUFFICIENT_VARIETY'
            ? '비밀번호는 영문/숫자/특수 중 3종 이상을 포함해야 합니다.'
            : '사용할 수 없는 비밀번호입니다.',
      );
      return;
    }

    try {
      const r = await bulk.mutateAsync({
        text,
        initialPassword,
        dryRun: false,
        skipExisting,
        previewToken: preview.previewToken,
      });
      onDone(
        `${r.createdUserCount}명을 만들었습니다.` +
          (r.createdGroupCount > 0 ? ` 그룹 ${r.createdGroupCount}개를 함께 만들었습니다.` : '') +
          (r.skippedUserCount > 0 ? ` 이미 있는 ${r.skippedUserCount}명은 건너뛰었습니다.` : ''),
      );
      onClose();
    } catch (err) {
      // 미리보기 이후에 다른 관리자가 무언가를 만든 경우다. 입력한 내용을 그대로 둔 채
      // 미리보기만 다시 받아, 관리자가 처음부터 다시 할 일이 없게 한다.
      if (err instanceof ApiError && err.code === 'BULK_IMPORT_STALE') {
        setNotice(apiErrorMessage(err));
        await loadPreview();
        return;
      }
      setError(apiErrorMessage(err));
    }
  }

  const blocked = preview !== null && preview.issues.length > 0;
  const busy = bulk.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-base font-bold">사용자 일괄 등록</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            닫기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <button
            type="button"
            onClick={() => setShowFormat((v) => !v)}
            className="text-xs font-semibold text-sky-600 underline"
          >
            {showFormat ? '형식 설명 접기' : '형식 설명 보기'}
          </button>
          {showFormat && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
              <p>
                들여쓰기로 조직 계층을 나타내고, 사용자 줄만 <code>- </code> 로 시작합니다.
              </p>
              <p className="mt-1">
                들여쓰기는 한 단계에 탭 하나입니다. 공백으로 맞춰도 되지만, 한 파일 안에서 탭과
                공백을 섞으면 계층이 어긋나므로 한 가지만 쓰십시오.
              </p>
              <p className="mt-1">
                사용자 줄은 <code>- 아이디, 이름</code> 이며 첫 쉼표만 구분자입니다.
              </p>
              <p className="mt-1">
                아이디는 영문·숫자와 <code>. _ -</code> 만 3~64자로 쓸 수 있습니다. 한글은 쓸 수
                없습니다.
              </p>
              <p className="mt-1">
                <code>#</code> 로 시작하는 줄과 빈 줄은 건너뜁니다.
              </p>
              <pre
                className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono dark:bg-slate-900"
                style={{ tabSize: 2 }}
              >
                {SAMPLE}
              </pre>
            </div>
          )}

          <label className="mt-4 block text-xs font-bold">텍스트 파일 선택</label>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => void handleFile(e)}
            className="mt-1 block w-full text-xs"
          />

          <label className="mt-4 block text-xs font-bold">내용 확인 / 직접 입력</label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            rows={10}
            placeholder={SAMPLE}
            className="mt-1 w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
          />

          {preview && (
            <div className="mt-4 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
              <p>
                새로 만들 사람 <b>{preview.usersToCreate.length}명</b>
              </p>
              <p>
                새로 만들 그룹 <b>{preview.groupsToCreate.length}개</b>
                {preview.groupsExisting.length > 0 && (
                  <span className="text-slate-500">
                    {' '}
                    (이미 있는 그룹 {preview.groupsExisting.length}개는 그대로 씁니다)
                  </span>
                )}
              </p>
              {preview.usersExisting.length > 0 && (
                <p className="mt-1 text-amber-600">
                  이미 있는 아이디 {preview.usersExisting.length}명 (
                  {preview.usersExisting.map((u) => u.username).join(', ')})
                </p>
              )}
              {preview.issues.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-rose-600">
                  {preview.issues.map((i, idx) => (
                    <li key={idx}>
                      {i.line > 0 ? `${i.line}번째 줄: ` : ''}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
              {(preview.groupsToCreate.length > 0 || preview.usersToCreate.length > 0) && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                  {preview.groupsToCreate.map((p, idx) => (
                    <p key={`g-${idx}`} className="font-mono">
                      {p.join(' / ')}
                    </p>
                  ))}
                  {preview.usersToCreate.map((u, idx) => (
                    <p key={`u-${idx}`} className="font-mono">
                      {u.username} · {u.displayName} —{' '}
                      {u.groupPath.length > 0 ? u.groupPath.join(' / ') : '소속 없음'}
                    </p>
                  ))}
                </div>
              )}
              {preview.usersExisting.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => {
                      // 토큰은 skipExisting 과 무관하므로(resolveImport 는 이 값을 받지 않고,
                      // bulkImportTokenOf() 도 groupsToCreate/usersToCreate 만으로 계산한다)
                      // 미리보기를 다시 받을 필요가 없다.
                      setSkipExisting(e.target.checked);
                    }}
                    className="h-4 w-4"
                  />
                  <span>이미 있는 아이디는 건너뛰고 나머지만 만들기</span>
                </label>
              )}
            </div>
          )}

          <label className="mt-4 block text-xs font-bold">초기 비밀번호 (전원 공통)</label>
          <input
            type="text"
            value={initialPassword}
            onChange={(e) => setInitialPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <p className="mt-1 text-xs text-slate-500">
            만들어진 계정은 첫 로그인 때 비밀번호를 반드시 바꿉니다.
          </p>

          {notice && <p className="mt-3 text-sm text-amber-600">{notice}</p>}
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            disabled={text.trim().length === 0 || busy}
            onClick={() => void loadPreview()}
            className="rounded border border-sky-600 px-3 py-1.5 text-sm font-semibold text-sky-700 disabled:opacity-50 dark:text-sky-400"
          >
            확인
          </button>
          <button
            type="button"
            disabled={preview === null || blocked || initialPassword.length === 0 || busy}
            onClick={() => void handleApply()}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
