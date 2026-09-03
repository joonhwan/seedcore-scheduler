import { useState } from 'react';
import type { GroupProjectCoverage } from '@sam/shared';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export interface SyncSide {
  groupName: string;
  coverage: GroupProjectCoverage[];
}

/**
 * 그룹 소속이 바뀐 뒤, 그 사람들을 관련 프로젝트에 함께 넣거나 뺄지 묻는다.
 *
 * **양쪽 모두 기본값은 체크 해제다.** 권한이 사람 모르게 바뀌지 않게 하는 것이 확정명세 ㉯ 회신의
 * 취지이므로, 빼는 쪽뿐 아니라 넣는 쪽도 관리자가 명시적으로 골라야 한다. 아무것도 고르지 않고
 * 확인하면 소속만 바뀌고 프로젝트 참여는 한 건도 변하지 않는다.
 */
export default function GroupProjectSyncDialog({
  title,
  userIds,
  addTo,
  removeFrom,
  onClose,
}: {
  title: string;
  /** 대상 인원. 그룹에 함께 넣거나 뺀 사람들이다. */
  userIds: string[];
  /** 새 소속이 참여 중인 프로젝트. 여기에 넣을지 묻는다. */
  addTo?: SyncSide | undefined;
  /** 이전 소속이 참여 중인 프로젝트. 여기서 뺄지 묻는다. */
  removeFrom?: SyncSide | undefined;
  onClose: () => void;
}) {
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(
    set: Set<string>,
    apply: (next: Set<string>) => void,
    projectId: string,
  ) {
    const next = new Set(set);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    apply(next);
  }

  async function onConfirm() {
    setBusy(true);
    let added = 0;
    let removed = 0;
    try {
      // 넣기는 프로젝트마다 일괄 추가 API 한 번이면 된다.
      for (const projectId of toAdd) {
        const result = await api.post<{ added: number }>(
          `/projects/${projectId}/members/bulk`,
          { members: userIds.map((userId) => ({ userId, role: 'MEMBER' })) },
        );
        added += result.added;
      }
      // 빼기는 사용자 기준 축을 쓰므로 사람마다 한 번씩 부른다.
      // 대상이 몇 명·몇 건 규모라 요청 수가 문제 되지 않는다.
      for (const projectId of toRemove) {
        for (const userId of userIds) {
          await api.delete<void>(`/admin/users/${userId}/projects/${projectId}`);
          removed += 1;
        }
      }
      toast.success(`프로젝트 참여 ${added}건 추가, ${removed}건 해제되었습니다.`);
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">{title}</h2>

        {removeFrom && removeFrom.coverage.length > 0 && (
          <section className="mt-3">
            <h3 className="text-sm font-semibold">
              이전 소속({removeFrom.groupName})이 참여 중인 프로젝트에서 빼기
            </h3>
            <ul className="mt-1 space-y-1">
              {removeFrom.coverage.map((c) => (
                <li key={c.projectId}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={toRemove.has(c.projectId)}
                      onChange={() => toggle(toRemove, setToRemove, c.projectId)}
                    />
                    {c.name}
                    <span className="text-xs text-slate-500">
                      ({removeFrom.groupName} {c.groupMemberCount}명 중{' '}
                      {c.participatingCount}명 참여)
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {addTo && addTo.coverage.length > 0 && (
          <section className="mt-3">
            <h3 className="text-sm font-semibold">
              새 소속({addTo.groupName})이 참여 중인 프로젝트에 넣기
            </h3>
            <ul className="mt-1 space-y-1">
              {addTo.coverage.map((c) => (
                <li key={c.projectId}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={toAdd.has(c.projectId)}
                      onChange={() => toggle(toAdd, setToAdd, c.projectId)}
                    />
                    {c.name}
                    <span className="text-xs text-slate-500">
                      ({addTo.groupName} {c.groupMemberCount}명 중 {c.participatingCount}명
                      참여)
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          소속만 바꾸고 프로젝트는 그대로 두려면 아무것도 고르지 않고 확인하십시오. 역할은
          MEMBER 로 들어갑니다.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? '처리 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
