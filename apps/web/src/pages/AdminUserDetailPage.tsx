import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  groupPathNames,
  type GroupProjectCoverage,
  type UserGroupItem,
  type ProjectRole,
  type UserListItem,
  type UserActivitySummary,
} from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import {
  useUsers,
  useUpdateUser,
  useUserActivity,
  useRetireUser,
  useUnretireUser,
  useDeleteUser,
  userActivityKey,
} from '../lib/users';
import { api } from '../lib/api';
import { useGroupTree, groupsKey } from '../lib/groups';
import { flattenGroupTree } from '../lib/groupTreeView';
import { useProjects } from '../lib/projects';
import {
  useAddUserProjects,
  useRemoveUserProject,
  useUpdateUserProjectRole,
  useUserProjects,
  userGroupsKey,
} from '../lib/userProjects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import BusyOverlay from '../components/BusyOverlay';
import GroupProjectSyncDialog from '../components/GroupProjectSyncDialog';
import UserDeleteConfirmDialog from '../components/UserDeleteConfirmDialog';
import {
  annotateBlockedTargets,
  buildAddSide,
  buildRemoveSide,
  type AddSide,
  type RemoveSide,
  type SyncUser,
} from '../lib/groupSync';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  // 사용자 단건 조회 API 가 없으므로 목록에서 골라 쓴다. 150명 규모라 부담이 없다.
  const users = useUsers({ status: 'all' });
  const user = users.data?.find((u) => u.id === id) ?? null;

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  if (!me.data) return <Navigate to="/login" replace />;
  // 관리자 모드도 함께 요구한다. 모드가 꺼지면 GET /projects 가 본인이 멤버인 프로젝트만
  // 돌려주어 "+ 프로젝트 일괄 추가" 대화상자가 반쪽이 되고(AGENTS.md §3), 수정도
  // ADMIN_OVERRIDE_EDIT 감사로그 없이 통과한다(AGENTS.md §4.4).
  //
  // 다만 이 화면은 관리자 모드 없이 열리는 사용자 관리 목록(/admin/users)에서 이름을 눌러
  // 들어오는 경로가 있어, 그 두 화면(ProjectNewPage·ProjectClonePage)의 짧은 문구보다
  // 친절하게 — 관리자 모드를 켜야 한다는 사실과 켜는 방법까지 — 안내한다.
  if (me.data.globalRole !== 'ADMIN' || !adminMode) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-lg font-semibold">관리자 모드가 필요합니다</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          이 화면은 ADMIN 사용자가 관리자 모드를 켠 상태에서만 열 수 있습니다. 화면 상단 헤더의
          관리자 모드 표시를 눌러 켜신 뒤 다시 시도하십시오.
        </p>
        <Link to="/admin/users" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 사용자 관리
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link to="/admin/users" className="text-xs text-slate-500 hover:underline">
        ← 사용자 관리
      </Link>

      {users.isLoading && <p className="mt-4 text-sm text-slate-500">로딩…</p>}
      {users.isError && (
        <p className="mt-4 text-sm text-rose-600">{apiErrorMessage(users.error)}</p>
      )}
      {users.data && !user && (
        <p className="mt-4 text-sm text-rose-600">사용자를 찾을 수 없습니다.</p>
      )}

      {user && id && (
        <>
          <AccountSection user={user} />
          <GroupSection userId={id} displayName={user.displayName} />
          <ProjectSection userId={id} />
          <AccountCleanupSection user={user} />
        </>
      )}
    </main>
  );
}

function AccountSection({ user }: { user: UserListItem }) {
  const [draftName, setDraftName] = useState(user.displayName);
  const update = useUpdateUser();

  // 다른 관리자가 이 사용자의 표시 이름을 고치면 user prop 이 새 값으로 바뀐다. 내가 아직
  // 손대지 않았을 때만(touched === false) 입력창을 새 값으로 맞춘다. 그러지 않으면 저장
  // 버튼의 비활성 조건(draftName === user.displayName)이 저절로 풀리고, 그대로 저장하면
  // 화면에 남은 옛 값이 상대의 변경을 조용히 덮어쓴다.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setDraftName(user.displayName);
  }, [user.displayName, touched]);

  async function onSaveName() {
    const next = draftName.trim();
    if (next.length === 0 || next === user.displayName) return;
    try {
      await update.mutateAsync({ id: user.id, patch: { displayName: next } });
      toast.success('표시 이름이 변경되었습니다.');
      setTouched(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
      // 입력값을 서버 값으로 되돌렸으므로 편집 표시도 함께 내린다. 이것이 없으면 한 번
      // 실패한 뒤로 이 필드가 외부 변경을 영구히 따라가지 않는다.
      setDraftName(user.displayName);
      setTouched(false);
    }
  }

  return (
    <>
      <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
        {user.displayName}
        <span className="text-sm font-normal text-slate-500">@{user.username}</span>
        {user.globalRole === 'ADMIN' && (
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ADMIN
          </span>
        )}
        {!user.isActive && (
          <span className="rounded border border-slate-400 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            비활성
          </span>
        )}
      </h1>

      <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold">계정</h2>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block text-sm">
            <span className="text-slate-700 dark:text-slate-300">표시 이름</span>
            <input
              type="text"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setTouched(true);
              }}
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <button
            type="button"
            onClick={onSaveName}
            disabled={update.isPending || draftName.trim() === user.displayName}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            저장
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          비밀번호 리셋·활성 토글·잠금 해제는 사용자 관리 목록에서 처리하십시오.
        </p>
      </section>
    </>
  );
}

/**
 * 사용자 한 명의 소속을 보여주고, 이 자리에서 바로 옮긴다.
 *
 * 예전에는 소속을 보여주기만 하고 "그룹 관리로 이동" 링크만 두어, 한 사람을 옮기려면 화면을
 * 옮겨 그 사람이 든 그룹을 찾아내야 했다. 사람에서 출발하는 것이 자연스러운 조작이므로 여기에
 * 선택 상자를 둔다.
 *
 * 옮긴 뒤에 뜨는 프로젝트 동기화 안내는 그룹 관리 화면의 것과 같은 대화상자다. **같은 이동인데
 * 어디서 했느냐에 따라 뒤처리가 달라지면 안 되기 때문이다.**
 */
function GroupSection({ userId, displayName }: { userId: string; displayName: string }) {
  const tree = useGroupTree();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sync, setSync] = useState<{
    title: string;
    addTo?: AddSide;
    removeFrom?: RemoveSide;
  } | null>(null);

  /**
   * 이 사용자의 소속을 **그룹 조회 응답 하나에서** 뽑는다.
   *
   * 예전에는 사용자별 소속(GET /admin/users/:id/groups)과 그룹 목록을 따로 받았다. 그러면
   * 앞의 것이 먼저 도착했을 때 이름을 만들 재료가 없어 빈 줄이 그려지고, 선택 상자에도
   * 후보가 없어 "(소속 없음)" 이 잠깐 비쳤다가 뒤늦게 제 값으로 바뀌었다. 그룹 조회는
   * 애초에 그룹과 소속을 한 응답에 담아 주므로(둘을 따로 부르면 값이 어긋난다는 이유로
   * 그렇게 설계했다) 여기서도 그 하나만 쓰면 어긋나는 순간 자체가 없다. 사용자 관리
   * 목록의 배지가 이미 같은 조회를 데워 놓기 때문에, 목록에서 들어오면 곧바로 보인다.
   *
   * 정렬은 배지와 같은 규칙(말단 이름 가나다순)을 쓴다. 그래야 목록에 뜬 그룹과 이 화면이
   * 고르는 "지금 소속" 이 같은 그룹을 가리킨다.
   */
  const myGroups = useMemo<UserGroupItem[]>(() => {
    const all = tree.data?.groups ?? [];
    const byId = new Map(all.map((g) => [g.id, g]));
    return (tree.data?.memberships ?? [])
      .filter((m) => m.userId === userId)
      .map((m) => byId.get(m.groupId))
      .filter((g): g is UserGroupItem => g !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [tree.data, userId]);

  const paths = useMemo(() => {
    const all = tree.data?.groups ?? [];
    return myGroups.map((g) => groupPathNames(all, g.id).join(' › '));
  }, [myGroups, tree.data?.groups]);

  // 그룹 관리 화면의 계층 트리와 같은 순서로 늘어놓고, 깊이를 들여쓰기로 나타낸다.
  const rows = useMemo(() => flattenGroupTree(tree.data?.groups ?? []), [tree.data?.groups]);

  // 지금 소속. 1인 1소속 운영이므로 첫 번째를 기준으로 삼되, 여럿이면 아래에 안내를 띄운다.
  const currentId = myGroups[0]?.id ?? '';
  const selected = draft ?? currentId;
  const changed = selected !== currentId;
  const multi = myGroups.length > 1;

  async function onMove() {
    const from = myGroups;
    const target = rows.find((r) => r.group.id === selected)?.group;
    const label = target ? `"${target.name}" 으로 옮기` : '소속에서 빼';
    const ok = window.confirm(`"${displayName}" 을(를) ${label}시겠습니까?`);
    if (!ok) return;

    setBusy(target ? '소속을 옮기는 중입니다...' : '소속을 해제하는 중입니다...');
    try {
      // 이전 소속의 집계는 **바꾸기 전에** 읽는다. 옮긴 뒤에 읽으면 이미 빠진 뒤의 값이라
      // 이 사람이 그 프로젝트에 있었는지를 가릴 수 없다(그룹 관리 화면과 같은 이유).
      //
      // 소속이 여럿이면 **모두** 읽는다. 옮기기(move: true)는 서버가 대상 그룹 밖의 소속을
      // 전부 지우고, 해제도 아래에서 소속 전부를 지운다. 그래서 첫 번째 그룹만 보면 나머지
      // 그룹으로 얽혔던 프로젝트 참여가 아무 안내 없이 남는다.
      const subject: SyncUser = { id: userId, displayName };
      const parts = await Promise.all(
        from.map(async (g) => ({
          groupName: g.name,
          coverage: await api.get<GroupProjectCoverage[]>(`/admin/groups/${g.id}/projects`),
          users: [subject],
        })),
      );
      // 이 사람이 실제로 참여 중인 프로젝트만 남기는 일은 buildRemoveSide 가 맡는다.
      // 그러지 않으면 빼기 목록에 없는 프로젝트가 올라가 확인 시 404 NOT_A_MEMBER 로
      // 막다른 길에 빠진다. 이어서 뺄 수 없는 항목(그 프로젝트에 남는 MANAGER 가 없는
      // 경우)에 이유를 달아 체크 자체를 막는다.
      const removeFrom = await annotateBlockedTargets(buildRemoveSide(parts));

      if (target) {
        // move: true 로 부르면 기존 소속에서 빼고 넣는 일이 요청 하나로 일어난다.
        await api.post(`/admin/groups/${target.id}/members`, {
          userIds: [userId],
          move: true,
        });
      } else {
        for (const g of from) {
          await api.delete(`/admin/groups/${g.id}/members/${userId}`);
        }
      }

      let addTo: AddSide | undefined;
      if (target) {
        const rowsAfter = await api.get<GroupProjectCoverage[]>(
          `/admin/groups/${target.id}/projects`,
        );
        addTo = buildAddSide(target.name, rowsAfter, [subject]);
      }

      // 재조회가 끝나기를 기다린 뒤에 덮개를 내려, 덮개가 사라지는 순간 소속 표시가 이미
      // 새 값으로 바뀌어 있게 한다.
      //
      // userActivityKey(userId) 도 함께 무효화한다. 그룹 소속 수(clearable.groupMemberships)가
      // 활동 집계에 들어가는데, ['admin','users',userId,'groups'] 무효화는 접두어가 달라
      // ['admin','users',userId,'activity'] 까지 덮지 않는다.
      await Promise.all([
        qc.invalidateQueries({ queryKey: groupsKey }),
        qc.invalidateQueries({ queryKey: userGroupsKey(userId) }),
        qc.invalidateQueries({ queryKey: userActivityKey(userId) }),
      ]);
      setDraft(null);
      toast.success(target ? '소속이 변경되었습니다.' : '소속이 해제되었습니다.');

      if (addTo || removeFrom) {
        setSync({
          title: target
            ? `"${displayName}" 을(를) "${target.name}" 으로 옮겼습니다.`
            : `"${displayName}" 의 소속을 해제했습니다.`,
          ...(addTo ? { addTo } : {}),
          ...(removeFrom ? { removeFrom } : {}),
        });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">소속 그룹</h2>
      {tree.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      {tree.data && myGroups.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">소속 없음.</p>
      )}
      <ul className="mt-2 space-y-1">
        {paths.map((p) => (
          <li key={p} className="text-sm">
            {p}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selected}
          onChange={(e) => setDraft(e.target.value)}
          disabled={tree.isLoading}
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">(소속 없음)</option>
          {rows.map(({ group, depth }) => (
            <option key={group.id} value={group.id}>
              {'\u00a0'.repeat(depth * 4)}
              {group.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onMove}
          disabled={!changed}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          소속 변경
        </button>
      </div>
      {multi && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          이 사용자는 그룹 두 곳 이상에 속해 있습니다. 소속을 바꾸면 위에 나열된 그룹 모두에서
          빠지고, 고른 그룹 한 곳에만 속하게 됩니다.
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        그룹 자체를 만들거나 지우려면{' '}
        <Link to="/admin/groups" className="text-sky-700 hover:underline dark:text-sky-400">
          그룹 관리
        </Link>{' '}
        화면을 쓰십시오.
      </p>

      {busy && <BusyOverlay label={busy} />}

      {sync && (
        <GroupProjectSyncDialog
          title={sync.title}
          addTo={sync.addTo}
          removeFrom={sync.removeFrom}
          onClose={() => setSync(null)}
        />
      )}
    </section>
  );
}

function ProjectSection({ userId }: { userId: string }) {
  const mine = useUserProjects(userId);
  const [addOpen, setAddOpen] = useState(false);
  const updateRole = useUpdateUserProjectRole(userId);
  const removeProject = useRemoveUserProject(userId);

  // 확인 창을 취소하면 상태가 바뀌지 않아 리렌더가 일어나지 않는다. 그러면 셀렉트에는 방금
  // 고른(거부된) 값이 그대로 남아 서버 상태와 어긋난다. 이 값을 올려 셀렉트를 다시 마운트해
  // value 로 되돌린다.
  const [cancelToken, setCancelToken] = useState(0);

  async function onRoleChange(projectId: string, name: string, role: ProjectRole) {
    const verb = role === 'MANAGER' ? 'MANAGER(매니저)로 승격' : 'MEMBER(일반 멤버)로 변경';
    const ok = window.confirm(`"${name}" 에서의 역할을 ${verb}하시겠습니까?`);
    if (!ok) {
      setCancelToken((n) => n + 1);
      return;
    }
    try {
      await updateRole.mutateAsync({ projectId, role });
      toast.success('역할이 변경되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onRemove(projectId: string, name: string) {
    const ok = window.confirm(`"${name}" 참여를 해제하시겠습니까?`);
    if (!ok) return;
    try {
      await removeProject.mutateAsync(projectId);
      toast.success('참여가 해제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">참여 프로젝트 {mine.data?.length ?? 0}건</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
        >
          + 프로젝트 일괄 추가
        </button>
      </div>

      {mine.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      {mine.isError && <p className="mt-2 text-sm text-rose-600">{apiErrorMessage(mine.error)}</p>}
      {mine.data && mine.data.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">참여 중인 프로젝트가 없습니다.</p>
      )}

      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {mine.data?.map((p) => (
          <li key={p.projectId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <Link to={`/projects/${p.projectId}`} className="flex-1 hover:underline">
              {p.name}
              {p.status === 'ARCHIVED' && (
                <span className="ml-2 rounded border border-slate-400 px-1.5 py-0.5 text-[10px] text-slate-500">
                  보관됨
                </span>
              )}
            </Link>
            <select
              key={`${p.projectId}:${p.role}:${cancelToken}`}
              value={p.role}
              onChange={(e) => onRoleChange(p.projectId, p.name, e.target.value as ProjectRole)}
              disabled={updateRole.isPending}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="MANAGER">MANAGER</option>
              <option value="MEMBER">MEMBER</option>
            </select>
            <span className="text-xs text-slate-500">{p.addedAt.slice(0, 10)}</span>
            <button
              type="button"
              onClick={() => onRemove(p.projectId, p.name)}
              disabled={removeProject.isPending}
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
            >
              제외
            </button>
          </li>
        ))}
      </ul>

      {addOpen && (
        <AddProjectsDialog
          userId={userId}
          alreadyIn={new Set(mine.data?.map((p) => p.projectId) ?? [])}
          onClose={() => setAddOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * 계정 정리 — 퇴사 처리·복직과 완전 삭제.
 *
 * 삭제 버튼은 **활동이 한 건이라도 있으면 아예 보이지 않는다**(확정명세 §6-가). 대신 무엇이
 * 남아 있어 지울 수 없는지 적는다. 집계를 "정리하면 없어지는 것"과 "지울 수 없는 것"으로 나눈
 * 덕분에, 앞의 것만 남은 계정에는 위 섹션에서 빼면 지울 수 있다고 안내할 수 있다.
 */
function AccountCleanupSection({ user }: { user: UserListItem }) {
  const navigate = useNavigate();
  const activity = useUserActivity(user.id);
  const retire = useRetireUser();
  const unretire = useUnretireUser();
  const remove = useDeleteUser();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const busy = retire.isPending || unretire.isPending || remove.isPending;
  const isRetired = user.retiredAt !== null;

  async function onRetire() {
    const ok = window.confirm(
      `${user.displayName} 님을 퇴사 처리하시겠습니까?\n\n` +
        '· 로그인이 막히고 지금 접속 중인 세션이 즉시 끊어집니다\n' +
        '· 사용자 목록 기본 화면에서 감춰집니다\n' +
        '· 프로젝트 참여자와 그룹 인원 후보에서 빠집니다\n' +
        '· 소속 그룹과 참여 중인 프로젝트는 그대로 남습니다\n' +
        '· 나중에 복직 처리로 되돌릴 수 있습니다',
    );
    if (!ok) return;
    try {
      await retire.mutateAsync(user.id);
      toast.success('퇴사 처리되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onUnretire() {
    try {
      await unretire.mutateAsync(user.id);
      toast.success('복직 처리되었습니다. 다시 로그인할 수 있습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(user.id);
      setDeleteOpen(false);
      toast.success('계정이 삭제되었습니다.');
      // 방금 지운 계정의 상세에 머무르면 다음 조회가 USER_NOT_FOUND 로 실패한다.
      navigate('/admin/users');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">계정 정리</h2>

      {isRetired && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {formatDay(user.retiredAt!)} 에 퇴사 처리되었습니다. 로그인이 막혀 있고 목록 기본
          화면에서 감춰집니다. 소속 그룹과 참여 프로젝트는 그대로 남아 있습니다.
        </p>
      )}

      <div className="mt-3 text-sm">
        <h3 className="text-xs font-semibold text-slate-500">활동 기록</h3>
        {activity.isLoading && <p className="mt-1 text-slate-500">세는 중…</p>}
        {activity.isError && (
          <p className="mt-1 text-rose-600">{apiErrorMessage(activity.error)}</p>
        )}
        {activity.data && <ActivityLines summary={activity.data} />}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isRetired ? (
          <button
            type="button"
            onClick={onUnretire}
            disabled={busy}
            className="rounded border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
          >
            복직 처리
          </button>
        ) : (
          <button
            type="button"
            onClick={onRetire}
            disabled={busy}
            className="rounded border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
          >
            퇴사 처리
          </button>
        )}

        {activity.data?.canDelete === true && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
            className="rounded border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            계정 삭제
          </button>
        )}
      </div>

      {deleteOpen && (
        <UserDeleteConfirmDialog
          username={user.username}
          displayName={user.displayName}
          busy={remove.isPending}
          onConfirm={onDelete}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * 집계를 사람이 읽는 문장으로 바꾼다.
 *
 * 두 갈래를 나눠 보여주는 이유는 관리자가 무엇을 하면 지울 수 있는지 알려 주기 위함이다.
 * 지울 수 없는 것이 하나라도 있으면 정리해도 소용없으므로 그 사실을 먼저 말한다.
 */
function ActivityLines({ summary }: { summary: UserActivitySummary }) {
  const { clearable, permanent } = summary;

  const clearableParts: string[] = [];
  if (clearable.projectMemberships > 0)
    clearableParts.push(`참여 프로젝트 ${clearable.projectMemberships}건`);
  if (clearable.groupMemberships > 0)
    clearableParts.push(`그룹 소속 ${clearable.groupMemberships}건`);

  const permanentParts: string[] = [];
  if (permanent.createdProjects > 0)
    permanentParts.push(`프로젝트 ${permanent.createdProjects}건 생성`);
  if (permanent.nodesCreated > 0) permanentParts.push(`일정 ${permanent.nodesCreated}건 생성`);
  if (permanent.nodesUpdated > 0) permanentParts.push(`일정 ${permanent.nodesUpdated}건 수정`);
  if (permanent.comments > 0) permanentParts.push(`댓글 ${permanent.comments}건`);
  if (permanent.history > 0) permanentParts.push(`변경 이력 ${permanent.history}건`);
  if (permanent.membershipsAdded > 0)
    permanentParts.push(`남을 프로젝트에 넣은 기록 ${permanent.membershipsAdded}건`);
  if (permanent.groupMembersAdded > 0)
    permanentParts.push(`남을 그룹에 넣은 기록 ${permanent.groupMembersAdded}건`);

  if (summary.canDelete) {
    return <p className="mt-1 text-slate-600 dark:text-slate-400">없습니다.</p>;
  }

  return (
    <div className="mt-1 space-y-1">
      {clearableParts.length > 0 && (
        <p className="text-slate-600 dark:text-slate-400">{clearableParts.join(' · ')}</p>
      )}
      {permanentParts.length > 0 && (
        <p className="text-slate-600 dark:text-slate-400">{permanentParts.join(' · ')}</p>
      )}
      <p className="pt-1 text-[13px] text-slate-500">
        {permanentParts.length > 0
          ? `이 계정은 ${permanentParts.join(', ')} 기록이 있어 삭제할 수 없습니다. 퇴사 처리를 이용하십시오.`
          : '위 섹션에서 참여와 소속을 정리하면 이 계정을 삭제할 수 있습니다.'}
      </p>
    </div>
  );
}

/** 퇴사 시각을 날짜까지만 보여준다. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function AddProjectsDialog({
  userId,
  alreadyIn,
  onClose,
}: {
  userId: string;
  alreadyIn: Set<string>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<ProjectRole>('MEMBER');
  const projects = useProjects();
  const add = useAddUserProjects(userId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = projects.data ?? [];
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects.data, query]);

  async function onConfirm() {
    try {
      const result = await add.mutateAsync({ projectIds: [...picked], role });
      toast.success(
        result.skipped > 0
          ? `${result.added}건 추가, ${result.skipped}건은 이미 참여 중이라 건너뛰었습니다.`
          : `${result.added}건에 추가되었습니다.`,
      );
      onClose();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">프로젝트 일괄 추가</h2>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트 검색"
            className="flex-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="MEMBER">MEMBER</option>
            <option value="MANAGER">MANAGER</option>
          </select>
        </div>

        <div className="mt-2 max-h-72 overflow-auto rounded border border-slate-100 dark:border-slate-800">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((p) => {
              const taken = alreadyIn.has(p.id);
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-2 px-3 py-2 ${
                      taken
                        ? 'opacity-50'
                        : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={taken}
                      checked={picked.has(p.id)}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                    />
                    <span className="text-sm">
                      {p.name}
                      {taken && <span className="ml-2 text-xs text-slate-500">참여 중</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={picked.size === 0 || add.isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {add.isPending ? '처리 중…' : `${picked.size}건 추가`}
          </button>
        </div>
      </div>
    </div>
  );
}
