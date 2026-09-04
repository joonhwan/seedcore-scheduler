import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { membersKey } from '../lib/members';
import { projectKey } from '../lib/projects';
import { userProjectsKey } from '../lib/userProjects';
import { userActivityKey } from '../lib/users';
import { groupsKey } from '../lib/groups';
import { syncUserIds, type AddSide, type RemoveSide } from '../lib/groupSync';

/**
 * 그룹 소속이 바뀐 뒤, 그 사람들을 관련 프로젝트에 함께 넣거나 뺄지 묻는다.
 *
 * **양쪽 모두 기본값은 체크 해제다.** 권한이 사람 모르게 바뀌지 않게 하는 것이 확정명세 ㉯ 회신의
 * 취지이므로, 빼는 쪽뿐 아니라 넣는 쪽도 관리자가 명시적으로 골라야 한다. 취소하거나 아무것도
 * 고르지 않고 적용하면 소속만 바뀌고 프로젝트 참여는 한 건도 변하지 않는다.
 *
 * 그래서 왼쪽 버튼은 "취소" 라도 방금 끝난 소속 변경까지 되돌리지는 않는다. 이 창은 그 뒤에
 * 딸린 프로젝트 참여만 다루며, 그 사실을 아래 안내 문구가 밝힌다.
 *
 * 대상 인원은 **프로젝트마다 따로** 들어 있다(`lib/groupSync`). 화면 전체의 선택 인원을 그대로
 * 쓰던 예전 방식은, 이전 그룹과 무관하게 그 프로젝트에 직접 참여하던 사람까지 함께 뺐다.
 */
export default function GroupProjectSyncDialog({
  title,
  addTo,
  removeFrom,
  onClose,
}: {
  title: string;
  /** 새 소속이 참여 중인 프로젝트. 여기에 넣을지 묻는다. */
  addTo?: AddSide | undefined;
  /** 이전 소속이 참여 중인 프로젝트. 여기서 뺄지 묻는다. */
  removeFrom?: RemoveSide | undefined;
  onClose: () => void;
}) {
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [toRemove, setToRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // 조합 단위로 거절당한 것들. 여기 남아 있으면 대화상자를 닫지 않고 이유를 보여 준다.
  const [failures, setFailures] = useState<string[]>([]);
  const qc = useQueryClient();

  // 부분 실패 뒤 다시 누를 때 이미 반영된 것을 또 보내지 않기 위한 기록.
  // 빼기는 이미 뺀 짝에 404 NOT_A_MEMBER 가 나서 진짜 원인을 가리므로 특히 중요하다.
  const doneAdd = useRef<Set<string>>(new Set());
  const donePair = useRef<Set<string>>(new Set());

  function toggle(set: Set<string>, apply: (next: Set<string>) => void, projectId: string) {
    const next = new Set(set);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    apply(next);
  }

  /** 거절당한 프로젝트의 체크를 푼다. 같은 실패를 되풀이하지 않게 하는 장치다. */
  function deselect(denials: Denial[]) {
    const addIds = new Set(denials.filter((d) => d.side === 'add').map((d) => d.projectId));
    const removeIds = new Set(denials.filter((d) => d.side === 'remove').map((d) => d.projectId));
    if (addIds.size > 0) {
      setToAdd((prev) => new Set([...prev].filter((id) => !addIds.has(id))));
    }
    if (removeIds.size > 0) {
      setToRemove((prev) => new Set([...prev].filter((id) => !removeIds.has(id))));
    }
  }

  async function onConfirm() {
    setBusy(true);
    setFailures([]);
    const denied: Denial[] = [];
    let added = 0;
    let removed = 0;
    try {
      // 넣기는 프로젝트마다 일괄 추가 API 한 번이면 된다.
      for (const target of addTo?.targets ?? []) {
        if (!toAdd.has(target.projectId)) continue;
        if (doneAdd.current.has(target.projectId)) continue;
        try {
          const result = await api.post<{ added: number }>(
            `/projects/${target.projectId}/members/bulk`,
            { members: target.users.map((u) => ({ userId: u.id, role: 'MEMBER' })) },
          );
          added += result.added;
          doneAdd.current.add(target.projectId);
        } catch (addErr) {
          if (!isPerRequestRefusal(addErr)) throw addErr;
          denied.push({
            projectId: target.projectId,
            side: 'add',
            text: `${target.name}: ${apiErrorMessage(addErr)}`,
          });
        }
      }
      // 빼기는 사용자 기준 축을 쓰므로 사람마다 한 번씩 부른다.
      // 대상이 몇 명·몇 건 규모라 요청 수가 문제 되지 않는다.
      for (const target of removeFrom?.targets ?? []) {
        if (!toRemove.has(target.projectId)) continue;
        for (const user of target.users) {
          const pairKey = `${target.projectId}:${user.id}`;
          if (donePair.current.has(pairKey)) continue;
          try {
            await api.delete<void>(`/admin/users/${user.id}/projects/${target.projectId}`);
            removed += 1;
          } catch (removeErr) {
            // AdminGroupsPage 가 이제 missingUserIds 로 미리 거르지만, 그 집계를 읽은
            // 뒤 다른 관리자가 먼저 이 사람을 이 프로젝트에서 뺐을 수 있다. 그 경우
            // 서버는 404 NOT_A_MEMBER 를 돌려주는데, 이걸 그대로 던지면 반복문 전체가
            // 멈추고 donePair 에도 남지 않아 재시도해도 같은 짝에서 또 막힌다.
            // NOT_A_MEMBER 는 "이미 원하는 상태(그 프로젝트에 없음)"이므로 조용히
            // 넘어가고 짝을 기록한다.
            if (removeErr instanceof ApiError && removeErr.code === 'NOT_A_MEMBER') {
              donePair.current.add(pairKey);
              continue;
            }
            // 그 밖의 4xx 도 이 짝 하나에 대한 거절이다. 대표적으로 그 프로젝트의 유일한
            // MANAGER 를 뺄 때 나오는 LAST_MANAGER 가 그렇다. 예전에는 이걸 그대로 던져
            // 반복문 전체가 그 자리에서 멈췄고, 뒤에 남은 사람과 프로젝트는 한 건도
            // 처리되지 않았다. 다시 눌러도 같은 짝에서 또 멈춰 대화상자만으로는 작업을
            // 끝낼 방법이 없었다. 이제는 이유를 모아 두고 나머지를 계속 처리한다.
            // (donePair 에는 넣지 않는다. 관리자가 다른 화면에서 MANAGER 를 한 명 더
            //  세운 뒤 이 대화상자에서 바로 다시 시도할 수 있어야 하기 때문이다.)
            if (!isPerRequestRefusal(removeErr)) throw removeErr;
            denied.push({
              projectId: target.projectId,
              side: 'remove',
              text: `${target.name} — ${user.displayName}: ${apiErrorMessage(removeErr)}`,
            });
            continue;
          }
          donePair.current.add(pairKey);
        }
      }

      if (denied.length > 0) {
        setFailures(denied.map((d) => d.text));
        // 거절당한 프로젝트는 선택을 푼다. 체크된 채로 두면 다시 적용해도 같은 자리에서
        // 또 거절당해(예: 그 프로젝트의 유일한 MANAGER) 창을 벗어날 길이 취소밖에 없다.
        // 사유를 해결한 관리자는 다시 체크해서 시도하면 된다.
        deselect(denied);
        toast.error(
          `프로젝트 참여 ${added}건 추가, ${removed}건 해제되었습니다. ${denied.length}건은 처리하지 못해 선택을 해제했습니다.`,
        );
        return;
      }
      toast.success(
        added + removed > 0
          ? `프로젝트 참여 ${added}건 추가, ${removed}건 해제되었습니다.`
          : '프로젝트 참여는 변경하지 않았습니다.',
      );
      onClose();
    } catch (err) {
      // 여기까지 성공한 것은 이미 서버에 반영되었다. 그 사실을 알리지 않으면 관리자가
      // 아무 일도 없었다고 오해한다.
      toast.error(
        `프로젝트 참여 ${added}건 추가, ${removed}건 해제까지 반영된 뒤 실패했습니다. ${apiErrorMessage(err)}`,
      );
      if (denied.length > 0) {
        setFailures(denied.map((d) => d.text));
        deselect(denied);
      }
    } finally {
      setBusy(false);
      // 부분 실패에서도 일부는 이미 서버에 반영되었으므로 성공 여부와 무관하게 갱신한다.
      for (const projectId of new Set([...toAdd, ...toRemove])) {
        qc.invalidateQueries({ queryKey: membersKey(projectId) });
        qc.invalidateQueries({ queryKey: projectKey(projectId) });
      }
      for (const userId of syncUserIds([addTo, removeFrom])) {
        qc.invalidateQueries({ queryKey: userProjectsKey(userId) });
        // 참여 프로젝트 수가 활동 집계(clearable.projectMemberships)에 들어가므로 함께
        // 무효화한다. userProjectsKey 무효화는 접두어가 달라 activity 키까지 덮지 않는다.
        qc.invalidateQueries({ queryKey: userActivityKey(userId) });
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
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          프로젝트 참여는 그룹이 아니라 사람마다 따로 정해집니다. 소속이 바뀌어도 참여가 저절로
          따라오지 않으므로, 아래에서 고른 프로젝트만 바뀝니다.
        </p>

        {/*
          프로젝트가 수십 개가 되어도 머리말과 버튼이 화면 밖으로 밀리지 않도록, 목록만
          따로 스크롤한다. min-h-0 이 없으면 flex 자식의 기본 최소 높이 때문에 넘치는 만큼
          상자가 그대로 늘어나 스크롤이 생기지 않는다.
        */}
        <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
          {removeFrom && removeFrom.targets.length > 0 && (
            <section className="mt-3">
              <h3 className="text-sm font-semibold">
                이전 소속({removeFrom.groupNames.join(', ')})이 참여 중인 프로젝트에서 빼기
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                이전 소속이 참여 중인 프로젝트 가운데, 소속이 바뀐 사람이 실제로 참여하고 있는 것만
                나옵니다.
              </p>
              <ul className="mt-1 space-y-1">
                {removeFrom.targets.map((t) => (
                  <li key={t.projectId}>
                    <label
                      className={`flex items-center gap-2 text-sm ${
                        t.blockedReason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={toRemove.has(t.projectId)}
                        disabled={t.blockedReason !== null}
                        onChange={() => toggle(toRemove, setToRemove, t.projectId)}
                      />
                      {t.name}
                      <span
                        className="text-xs text-slate-500"
                        title={t.users.map((u) => u.displayName).join(', ')}
                      >
                        ({t.users.length}명 해제)
                      </span>
                    </label>
                    {t.blockedReason && (
                      <p className="ml-6 text-[11px] text-amber-700 dark:text-amber-400">
                        {t.blockedReason} 프로젝트 화면에서 다른 MANAGER 를 지정한 뒤 처리하십시오.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {addTo && addTo.targets.length > 0 && (
            <section className="mt-3">
              <h3 className="text-sm font-semibold">
                새 소속({addTo.groupName})이 참여 중인 프로젝트에 넣기
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                새 소속이 참여 중인 프로젝트 가운데, 소속이 바뀐 사람이 아직 참여하지 않은 것만
                나옵니다.
              </p>
              <ul className="mt-1 space-y-1">
                {addTo.targets.map((t) => (
                  <li key={t.projectId}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={toAdd.has(t.projectId)}
                        onChange={() => toggle(toAdd, setToAdd, t.projectId)}
                      />
                      {t.name}
                      <span
                        className="text-xs text-slate-500"
                        title={t.users.map((u) => u.displayName).join(', ')}
                      >
                        ({t.users.length}명 추가 · {addTo.groupName} {t.groupMemberCount}명 중{' '}
                        {t.participatingCount}명 참여)
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* 실패 안내는 스크롤 영역 밖에 둔다. 목록을 내려 보던 중이라도 바로 눈에 띄어야 한다. */}
        {failures.length > 0 && (
          <section className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950">
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              처리하지 못한 항목
            </h3>
            <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-amber-800 dark:text-amber-300">
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              나머지는 모두 반영되었고, 위 항목은 선택을 해제했습니다. 사유를 해결했다면 다시 선택해
              적용하고, 그대로 두려면 취소하십시오.
            </p>
          </section>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold">적용과 취소는 프로젝트 참여에만 해당합니다.</span> 소속
          변경은 이미 반영되었으므로 취소해도 되돌아가지 않습니다. 프로젝트 참여를 그대로 두려면
          취소하고, 넣기로 들어가는 역할은 MEMBER 입니다.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {busy ? '처리 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 조합 하나가 거절당한 기록. 어느 프로젝트의 어느 쪽이었는지까지 남긴다. */
interface Denial {
  projectId: string;
  side: 'add' | 'remove';
  text: string;
}

/**
 * 요청 하나에 대한 거절인가. 4xx 는 그 요청의 사정(마지막 MANAGER, 이미 없는 참여 등)이라
 * 나머지를 계속 처리해도 된다. 5xx·네트워크 오류는 서버나 연결 자체의 문제이므로 그대로
 * 던져 반복을 멈춘다.
 */
function isPerRequestRefusal(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500;
}
