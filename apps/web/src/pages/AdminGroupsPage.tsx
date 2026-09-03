import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  canReparentGroup,
  collectDescendantGroupIds,
  type UserGroupItem,
} from '@sam/shared';
import { useMe } from '../lib/auth';
import {
  useAddGroupMembers,
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroupTree,
  useRemoveGroupMember,
  useUpdateGroup,
} from '../lib/groups';
import { useUsers } from '../lib/users';
import { flattenGroupTree } from '../lib/groupTreeView';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import UserPickerDialog from '../components/UserPickerDialog';

export default function AdminGroupsPage() {
  const me = useMe();
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
  if (me.data.globalRole !== 'ADMIN') {
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
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const addMembers = useAddGroupMembers(group.id);
  const removeMember = useRemoveGroupMember(group.id);
  const users = useUsers({ status: 'active' });

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
      try {
        await addMembers.mutateAsync({ userIds, move: true });
        toast.success(`${userIds.length}명이 추가되었습니다.`);
        setPickerOpen(false);
      } catch (retryErr) {
        toast.error(apiErrorMessage(retryErr));
      }
    }
  }

  async function onRemoveMember(userId: string, displayName: string) {
    const ok = window.confirm(`"${displayName}" 을(를) 이 그룹에서 빼시겠습니까?`);
    if (!ok) return;
    try {
      await removeMember.mutateAsync(userId);
      toast.success('소속이 해제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
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

      <h3 className="mt-5 border-t border-slate-100 pt-3 text-sm font-semibold dark:border-slate-800">
        소속 인원 {members.data?.length ?? 0}명
      </h3>
      {members.isLoading && <p className="mt-2 text-sm text-slate-500">로딩…</p>}
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {members.data?.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="flex-1">
              {m.displayName}{' '}
              <span className="text-xs text-slate-500">@{m.username}</span>
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

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold dark:border-slate-700"
      >
        + 인원 추가
      </button>

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
