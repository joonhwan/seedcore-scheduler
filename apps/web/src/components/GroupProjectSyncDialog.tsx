import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GroupProjectCoverage } from '@sam/shared';
import { api, ApiError } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { membersKey } from '../lib/members';
import { projectKey } from '../lib/projects';
import { userProjectsKey } from '../lib/userProjects';
import { groupsKey } from '../lib/groups';

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
  const qc = useQueryClient();

  // 부분 실패 뒤 다시 누를 때 이미 반영된 것을 또 보내지 않기 위한 기록.
  // 빼기는 이미 뺀 짝에 404 NOT_A_MEMBER 가 나서 진짜 원인을 가리므로 특히 중요하다.
  const doneAdd = useRef<Set<string>>(new Set());
  const donePair = useRef<Set<string>>(new Set());

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
        if (doneAdd.current.has(projectId)) continue;
        const result = await api.post<{ added: number }>(
          `/projects/${projectId}/members/bulk`,
          { members: userIds.map((userId) => ({ userId, role: 'MEMBER' })) },
        );
        added += result.added;
        doneAdd.current.add(projectId);
      }
      // 빼기는 사용자 기준 축을 쓰므로 사람마다 한 번씩 부른다.
      // 대상이 몇 명·몇 건 규모라 요청 수가 문제 되지 않는다.
      for (const projectId of toRemove) {
        for (const userId of userIds) {
          const pairKey = `${projectId}:${userId}`;
          if (donePair.current.has(pairKey)) continue;
          try {
            await api.delete<void>(`/admin/users/${userId}/projects/${projectId}`);
            removed += 1;
          } catch (removeErr) {
            // AdminGroupsPage 가 이제 missingUserIds 로 미리 거르지만, 그 집계를 읽은
            // 뒤 다른 관리자가 먼저 이 사람을 이 프로젝트에서 뺐을 수 있다. 그 경우
            // 서버는 404 NOT_A_MEMBER 를 돌려주는데, 이걸 그대로 던지면 반복문 전체가
            // 멈추고 donePair 에도 남지 않아 재시도해도 같은 짝에서 또 막힌다.
            // NOT_A_MEMBER 는 "이미 원하는 상태(그 프로젝트에 없음)"이므로 조용히
            // 넘어가고 짝을 기록한다. 다른 오류는 지금처럼 밖으로 던진다.
            if (removeErr instanceof ApiError && removeErr.code === 'NOT_A_MEMBER') {
              donePair.current.add(pairKey);
              continue;
            }
            throw removeErr;
          }
          donePair.current.add(pairKey);
        }
      }
      toast.success(`프로젝트 참여 ${added}건 추가, ${removed}건 해제되었습니다.`);
      onClose();
    } catch (err) {
      // 여기까지 성공한 것은 이미 서버에 반영되었다. 그 사실을 알리지 않으면 관리자가
      // 아무 일도 없었다고 오해한다.
      toast.error(
        `프로젝트 참여 ${added}건 추가, ${removed}건 해제까지 반영된 뒤 실패했습니다. ${apiErrorMessage(err)}`,
      );
    } finally {
      setBusy(false);
      // 부분 실패에서도 일부는 이미 서버에 반영되었으므로 성공 여부와 무관하게 갱신한다.
      for (const projectId of new Set([...toAdd, ...toRemove])) {
        qc.invalidateQueries({ queryKey: membersKey(projectId) });
        qc.invalidateQueries({ queryKey: projectKey(projectId) });
      }
      for (const userId of userIds) {
        qc.invalidateQueries({ queryKey: userProjectsKey(userId) });
      }
      qc.invalidateQueries({ queryKey: ['projects'] });
      // groupProjectsKey(groupId) 는 ['admin','groups', groupId, 'projects'] 형태라
      // groupsKey(['admin','groups']) 무효화가 접두어 일치로 그 아래를 모두 덮는다.
      // 이 대화상자는 어느 그룹에서 열렸는지 모르므로(옮긴 경우 addTo·removeFrom 두 그룹) 이 편이 맞다.
      qc.invalidateQueries({ queryKey: groupsKey });
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
