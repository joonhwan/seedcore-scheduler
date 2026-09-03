import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  canReparentGroup,
  collectDescendantGroupIds,
  type GroupProjectCoverage,
  type UserGroupItem,
} from '@sam/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { api } from '../lib/api';
import {
  useAddGroupMembers,
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroupProjects,
  useGroupTree,
  useRemoveGroupMember,
  useUpdateGroup,
  groupsKey,
} from '../lib/groups';
import { useUsers } from '../lib/users';
import { flattenGroupTree } from '../lib/groupTreeView';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import UserPickerDialog from '../components/UserPickerDialog';
import GroupProjectSyncDialog, { type SyncSide } from '../components/GroupProjectSyncDialog';
import BusyOverlay from '../components/BusyOverlay';

export default function AdminGroupsPage() {
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const tree = useGroupTree();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const createGroup = useCreateGroup();

  const rows = useMemo(
    () => flattenGroupTree(tree.data?.groups ?? []),
    [tree.data?.groups],
  );
  const selected = tree.data?.groups.find((g) => g.id === selectedId) ?? null;

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  if (!me.data) return <Navigate to="/login" replace />;
  // 관리자 모드도 함께 요구한다. 이 화면의 인원 이동은 members.bulk·user-projects 라우트를
  // 부르는데, 관리자 모드가 꺼진 채로도 라우트 자체는 통과하므로(ADMIN 이므로) 모드를 안 켜면
  // ADMIN_OVERRIDE_EDIT 감사로그가 빠진다 (AGENTS.md §4.4).
  if (me.data.globalRole !== 'ADMIN' || !adminMode) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-rose-600">ADMIN 권한이 필요합니다.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 프로젝트 목록
        </Link>
      </main>
    );
  }

  async function onCreateTopLevel() {
    const name = window.prompt('새 최상위 그룹의 이름을 입력하십시오.');
    if (name === null) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      const created = await createGroup.mutateAsync({
        name: trimmed,
        parentId: null,
        description: null,
      });
      toast.success(`"${created.name}" 그룹이 생성되었습니다.`);
      setSelectedId(created.id);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onCreateChild(parent: UserGroupItem) {
    const name = window.prompt(`"${parent.name}" 아래에 만들 그룹의 이름을 입력하십시오.`);
    if (name === null) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      const created = await createGroup.mutateAsync({
        name: trimmed,
        parentId: parent.id,
        description: null,
      });
      toast.success(`"${created.name}" 그룹이 생성되었습니다.`);
      setSelectedId(created.id);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">그룹 관리</h1>
        <button
          type="button"
          onClick={onCreateTopLevel}
          disabled={createGroup.isPending}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          + 최상위 그룹
        </button>
      </div>

      {tree.isError && (
        <p className="mt-4 text-sm text-rose-600">{apiErrorMessage(tree.error)}</p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 dark:border-slate-700">
          <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold dark:border-slate-800">
            계층 트리
          </h2>
          {tree.isLoading && <p className="p-4 text-sm text-slate-500">로딩…</p>}
          {tree.data && rows.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              아직 그룹이 없습니다. "+ 최상위 그룹" 으로 시작하십시오.
            </p>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(({ group, depth }) => (
              <li
                key={group.id}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${
                  group.id === selectedId ? 'bg-sky-50 dark:bg-sky-950/40' : ''
                }`}
                style={{ paddingLeft: `${16 + depth * 12}px` }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(group.id)}
                  className="flex-1 text-left hover:underline"
                >
                  {group.name}
                  <span className="ml-2 text-xs text-slate-500">
                    {group.totalMemberCount}명
                    {group.totalMemberCount !== group.directMemberCount && (
                      <> (직속 {group.directMemberCount})</>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateChild(group)}
                  title="하위 그룹 추가"
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs dark:border-slate-700"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <GroupDetailPanel
            key={selected.id}
            group={selected}
            allGroups={tree.data?.groups ?? []}
            membershipByUser={
              new Map(
                (tree.data?.memberships ?? []).map((m) => [m.userId, m.groupId]),
              )
            }
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <section className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">
            왼쪽에서 그룹을 고르면 여기에 상세 정보가 나옵니다.
          </section>
        )}
      </div>
    </main>
  );
}

function GroupDetailPanel({
  group,
  allGroups,
  membershipByUser,
  onDeleted,
}: {
  group: UserGroupItem;
  allGroups: UserGroupItem[];
  membershipByUser: Map<string, string>;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [parentId, setParentId] = useState<string | null>(group.parentId);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 다른 관리자가 이 그룹을 고치면 group prop 이 새 값으로 바뀐다. 내가 아직 손대지 않은
  // 필드는 그때 새 값으로 맞춰 둔다. 그러지 않으면 저장 버튼이 저절로 켜지고, 그대로 누르면
  // 화면에 남은 옛 값이 상대의 변경을 조용히 덮어쓴다.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setName(group.name);
    setDescription(group.description ?? '');
    setParentId(group.parentId);
  }, [group.name, group.description, group.parentId, touched]);

  const members = useGroupMembers(group.id);
  const coverage = useGroupProjects(group.id);
  const [sync, setSync] = useState<{
    title: string;
    userIds: string[];
    addTo?: SyncSide;
    removeFrom?: SyncSide;
  } | null>(null);
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const addMembers = useAddGroupMembers(group.id);
  const removeMember = useRemoveGroupMember(group.id);
  const users = useUsers({ status: 'active' });
  const qc = useQueryClient();
  /**
   * 화면 전체를 덮는 대기 표시의 문구. null 이면 덮개를 그리지 않는다.
   *
   * 개별 뮤테이션의 isPending 을 쓰지 않는 이유가 있다. 이 화면의 소속 추가·해제는 요청 하나로
   * 끝나지 않고 **집계 조회 → 변경 요청 → 목록 재조회**를 잇달아 수행하는데, isPending 은 그중
   * 가운데 한 구간만 덮는다. 앞뒤 구간이 표시 없이 비면 사용자에게는 화면이 멈춘 것으로 보인다.
   * 그래서 조작 전체를 감싸는 상태를 따로 둔다.
   */
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * 상위 그룹 선택지에서 자기 자신과 자손을 미리 뺀다. 순환은 화면 단계에서 막히고, 서버 검사는
   * 안전망으로 남는다. 깊이가 넘치는 후보도 함께 빼서 고를 수 없게 한다.
   */
  const parentOptions = useMemo(() => {
    const nodes = allGroups.map((g) => ({ id: g.id, parentId: g.parentId }));
    const banned = collectDescendantGroupIds(nodes, [group.id]);
    return allGroups.filter(
      (g) => !banned.has(g.id) && canReparentGroup(nodes, group.id, g.id).ok,
    );
  }, [allGroups, group.id]);

  const canDelete = group.directMemberCount === 0 && !allGroups.some((g) => g.parentId === group.id);
  const dirty =
    name.trim() !== group.name ||
    (description.trim() || null) !== group.description ||
    parentId !== group.parentId;

  async function onSave() {
    try {
      await update.mutateAsync({
        id: group.id,
        patch: {
          name: name.trim(),
          description: description.trim() || null,
          parentId,
        },
      });
      toast.success('그룹 정보가 저장되었습니다.');
      setTouched(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onDelete() {
    const ok = window.confirm(`"${group.name}" 그룹을 삭제하시겠습니까?`);
    if (!ok) return;
    try {
      await remove.mutateAsync(group.id);
      toast.success('그룹이 삭제되었습니다.');
      onDeleted();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  /**
   * 고른 사람 중 다른 그룹 소속자가 있으면 서버가 GROUP_MEMBER_ALREADY_ASSIGNED 로 거부하고
   * 충돌 목록을 돌려준다. 그때 확인 창을 띄우고, 승인하면 move: true 로 다시 부른다.
   */
  async function onAddMembers(userIds: string[]) {
    try {
      await addMembers.mutateAsync({ userIds, move: false });
      toast.success(`${userIds.length}명이 추가되었습니다.`);
      setPickerOpen(false);
      // 대화상자가 닫힌 뒤에도 집계 조회가 한 번 더 남아 있다. 그 구간을 비워 두면 화면이
      // 잠잠하다가 동기화 대화상자가 갑자기 튀어나온 것처럼 보인다.
      setBusy('참여 중인 프로젝트를 확인하는 중입니다...');
      try {
        // 집계 조회와 목록 재조회를 함께 기다린다. 재조회까지 끝난 뒤에 덮개를 내려야
        // 덮개가 사라지는 순간 소속 인원 목록이 이미 갱신되어 있다.
        const [rows] = await Promise.all([
          api.get<GroupProjectCoverage[]>(`/admin/groups/${group.id}/projects`),
          qc.invalidateQueries({ queryKey: groupsKey }),
        ]);
        if (rows.length > 0) {
          setSync({
            title: `${userIds.length}명을 "${group.name}" 에 넣었습니다.`,
            userIds,
            addTo: { groupName: group.name, coverage: rows },
          });
        }
      } finally {
        setBusy(null);
      }
      return;
    } catch (err) {
      const conflicts = conflictsOf(err);
      if (conflicts === null) {
        toast.error(apiErrorMessage(err));
        return;
      }
      const nameOf = new Map(
        (users.data ?? []).map((u) => [u.id, u.displayName] as const),
      );
      const names = conflicts
        .map((c) => {
          const g = allGroups.find((x) => x.id === c.groupId);
          return `${nameOf.get(c.userId) ?? c.userId}(${g?.name ?? '알 수 없는 그룹'})`;
        })
        .join(', ');
      const ok = window.confirm(
        `선택하신 ${userIds.length}명 중 ${conflicts.length}명은 이미 다른 그룹에 속해 있습니다.\n${names}\n\n기존 소속에서 빼고 "${group.name}" 으로 옮기시겠습니까?`,
      );
      if (!ok) return;
      // 덮개는 확인 창에 답한 **뒤에** 올린다. window.confirm 은 메인 스레드를 막으므로,
      // 묻기 전에 올리면 "처리 중" 문구가 질문 뒤에 남아 서로 어긋나 보인다.
      setBusy('소속을 옮기는 중입니다...');
      try {
        // 옮기기 전에 이전 그룹의 집계를 읽는다. 옮긴(move: true) 뒤에 읽으면 이미 이 그룹
        // 소속에서 빠진 뒤의 집계가 나와, missingUserIds 로 "실제로 참여 중인 프로젝트"를
        // 가릴 수 없다 (이 화면에서 GET 이 안전하다고 안심하면 안 되는 지점 — 옮기기는
        // move: true 요청 한 번에서 빼기·넣기가 함께 일어나므로 그 요청 전에 읽어야 한다).
        //
        // 이전 그룹이 여럿이면 첫 번째만 다룬다 — 1인 1소속 운영에서 여럿이 섞이는 경우는
        // 드물고, 남은 것은 그룹 관리 화면의 상시 패널로 언제든 확인할 수 있기 때문이다.
        const previousGroupId = conflicts[0]?.groupId;
        const previousGroup = allGroups.find((g) => g.id === previousGroupId);
        // 실제로 이 이전 그룹에서 넘어가는 사람만 추린다. userIds 전체가 아니라 이들 기준으로
        // 걸러야 한다 — userIds 에는 이전 그룹과 무관한(원래 무소속이던) 사람도 섞여 있다.
        const movingUserIds = conflicts
          .filter((c) => c.groupId === previousGroupId)
          .map((c) => c.userId);
        const removeRowsRaw =
          previousGroupId !== undefined
            ? await api.get<GroupProjectCoverage[]>(
                `/admin/groups/${previousGroupId}/projects`,
              )
            : [];
        // missingUserIds 에 이 이전 그룹 인원 중 넘어가는 사람이 전혀 없는(=아무도 참여하지
        // 않는) 프로젝트는 뺀다. 그래야 대화상자의 "빼기" 목록이 실제로 뺄 사람이 있는
        // 프로젝트만 담아, DELETE 가 404 NOT_A_MEMBER 로 막다른 길에 빠지는 것을 줄인다.
        const removeRows = removeRowsRaw.filter((c) =>
          movingUserIds.some((uid) => !c.missingUserIds.includes(uid)),
        );

        await addMembers.mutateAsync({ userIds, move: true });
        toast.success(`${userIds.length}명이 추가되었습니다.`);
        setPickerOpen(false);

        // 넣은 직후: 새 소속이 참여 중인 프로젝트에 함께 넣을지 묻는다.
        const [rows] = await Promise.all([
          api.get<GroupProjectCoverage[]>(`/admin/groups/${group.id}/projects`),
          qc.invalidateQueries({ queryKey: groupsKey }),
        ]);

        if (rows.length > 0 || removeRows.length > 0) {
          setSync({
            title: `${userIds.length}명을 "${group.name}" 으로 옮겼습니다.`,
            userIds,
            ...(rows.length > 0
              ? { addTo: { groupName: group.name, coverage: rows } }
              : {}),
            ...(removeRows.length > 0 && previousGroup !== undefined
              ? { removeFrom: { groupName: previousGroup.name, coverage: removeRows } }
              : {}),
          });
        }
      } catch (retryErr) {
        toast.error(apiErrorMessage(retryErr));
      } finally {
        setBusy(null);
      }
    }
  }

  async function onRemoveMember(userId: string, displayName: string) {
    const ok = window.confirm(`"${displayName}" 을(를) 이 그룹에서 빼시겠습니까?`);
    if (!ok) return;
    // 여기서부터 서버를 세 번 다녀온다(집계 조회 → 해제 → 목록 재조회). 그동안 표시가 없으면
    // 뺀 사람의 행이 그대로 남아 있어 눌러도 아무 일이 없는 것처럼 보인다.
    setBusy('소속을 해제하는 중입니다...');
    try {
      // 빼기 전에 집계를 읽는다. 뺀 뒤에 읽으면(예전 버그) 이미 이 사람이 빠진 "남은 인원"
      // 기준의 집계가 나와, 방금 뺀 사람이 그 프로젝트에 있었는지와 무관해진다. 그러면
      // 대화상자가 그 사람이 없는 프로젝트까지 체크 목록에 올려, 확인 시 DELETE 가
      // 404 NOT_A_MEMBER 로 막다른 길에 빠진다.
      const rows = await api.get<GroupProjectCoverage[]>(`/admin/groups/${group.id}/projects`);
      // missingUserIds 에 이 사람이 없는(=참여 중인) 프로젝트만 남긴다. 이것이 "그 사람이
      // 실제로 참여 중인 프로젝트"다.
      const coverage = rows.filter((c) => !c.missingUserIds.includes(userId));

      await removeMember.mutateAsync(userId);
      toast.success('소속이 해제되었습니다.');
      // 재조회가 끝나기를 기다린 뒤에 덮개를 내린다. 기다리지 않으면 덮개가 사라진 화면에
      // 방금 뺀 사람이 잠시 그대로 남아 있어, 해제가 안 된 것처럼 보인다.
      await qc.invalidateQueries({ queryKey: groupsKey });
      if (coverage.length > 0) {
        setSync({
          title: `"${displayName}" 을(를) "${group.name}" 에서 뺐습니다.`,
          userIds: [userId],
          removeFrom: { groupName: group.name, coverage },
        });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const inputCls =
    'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">{group.name}</h2>

      <label className="mt-3 block text-sm">
        <span className="text-slate-700 dark:text-slate-300">이름</span>
        <input
          className={inputCls}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setTouched(true);
          }}
          maxLength={64}
        />
      </label>

      <label className="mt-2 block text-sm">
        <span className="text-slate-700 dark:text-slate-300">설명</span>
        <input
          className={inputCls}
          type="text"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setTouched(true);
          }}
          maxLength={500}
        />
      </label>

      <label className="mt-2 block text-sm">
        <span className="text-slate-700 dark:text-slate-300">상위 그룹</span>
        <select
          className={inputCls}
          value={parentId ?? ''}
          onChange={(e) => {
            setParentId(e.target.value === '' ? null : e.target.value);
            setTouched(true);
          }}
        >
          <option value="">(최상위)</option>
          {parentOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || update.isPending}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete || remove.isPending}
          title={
            canDelete
              ? undefined
              : '소속 인원이나 하위 그룹이 남아 있어 삭제할 수 없습니다.'
          }
          className="rounded border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
        >
          그룹 삭제
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <h3 className="text-sm font-semibold">소속 인원 {members.data?.length ?? 0}명</h3>
        {/* 인원을 넣는 버튼은 이 목록의 조작이므로 목록 제목 옆에 둔다. 예전에는 아래쪽
            "참여 중인 프로젝트" 목록 뒤에 있어서 프로젝트에 인원을 넣는 것처럼 읽혔다. */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold dark:border-slate-700"
        >
          + 인원 추가
        </button>
      </div>
      {members.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {members.data?.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="flex-1">
              {/* 이름에서 개별 사용자 화면으로 바로 갈 수 있게 한다. 그 화면에서 소속을
                  바꾸거나 참여 프로젝트를 손볼 수 있으므로, 여기서 사람을 찾은 뒤 다시
                  사용자 관리 목록에서 같은 사람을 찾는 걸음을 없앤다. */}
              <Link
                to={`/admin/users/${m.userId}`}
                className="font-medium text-sky-700 hover:underline dark:text-sky-400"
              >
                {m.displayName}
              </Link>{' '}
              <span className="text-xs text-slate-500">@{m.username}</span>
              {!m.isActive && (
                <span className="ml-2 rounded border border-slate-400 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  비활성
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onRemoveMember(m.userId, m.displayName)}
              className="rounded border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700"
            >
              제외
            </button>
          </li>
        ))}
        {members.data && members.data.length === 0 && (
          <li className="py-2 text-sm text-slate-500">소속 인원이 없습니다.</li>
        )}
      </ul>

      <h3 className="mt-5 border-t border-slate-100 pt-3 text-sm font-semibold dark:border-slate-800">
        참여 중인 프로젝트
      </h3>
      {coverage.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      {coverage.data && coverage.data.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          이 그룹 인원이 참여 중인 프로젝트가 없습니다.
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {coverage.data?.map((c) => (
          <li key={c.projectId} className="text-sm">
            {c.name}
            <span className="ml-2 text-xs text-slate-500">
              {c.groupMemberCount}명 중 {c.participatingCount}명 참여
            </span>
          </li>
        ))}
      </ul>

      {pickerOpen && (
        <UserPickerDialog
          title={`"${group.name}" 에 인원 추가`}
          excludeUserIds={new Set(members.data?.map((m) => m.userId) ?? [])}
          membershipByUser={membershipByUser}
          groups={allGroups}
          busy={addMembers.isPending}
          onCancel={() => setPickerOpen(false)}
          onConfirm={onAddMembers}
        />
      )}

      {busy && <BusyOverlay label={busy} />}

      {sync && (
        <GroupProjectSyncDialog
          title={sync.title}
          userIds={sync.userIds}
          addTo={sync.addTo}
          removeFrom={sync.removeFrom}
          onClose={() => setSync(null)}
        />
      )}
    </section>
  );
}

/** GROUP_MEMBER_ALREADY_ASSIGNED 응답에 담긴 충돌 목록을 꺼낸다. 아니면 null. */
function conflictsOf(err: unknown): Array<{ groupId: string; userId: string }> | null {
  if (typeof err !== 'object' || err === null) return null;
  const body = (err as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null) return null;
  const record = body as { error?: unknown; conflicts?: unknown };
  if (record.error !== 'GROUP_MEMBER_ALREADY_ASSIGNED') return null;
  if (!Array.isArray(record.conflicts)) return null;
  return record.conflicts as Array<{ groupId: string; userId: string }>;
}
