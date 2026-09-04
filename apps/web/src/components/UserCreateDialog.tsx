import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreateUserDto, validatePassword, PASSWORD_MIN_LENGTH } from '@sam/shared';
import { useCreateUser } from '../lib/users';
import { api } from '../lib/api';
import { useGroupTree, groupsKey } from '../lib/groups';
import { flattenGroupTree } from '../lib/groupTreeView';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function UserCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (temporaryPassword: string | null, displayName: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUser();
  const tree = useGroupTree();
  const qc = useQueryClient();

  // 그룹 관리 화면의 계층 트리와 같은 순서로 늘어놓고, 깊이를 들여쓰기로 나타낸다.
  const rows = useMemo(() => flattenGroupTree(tree.data?.groups ?? []), [tree.data?.groups]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = CreateUserDto.safeParse({
      username: username.trim(),
      displayName: displayName.trim(),
      initialPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인하세요.');
      return;
    }
    const policy = validatePassword(parsed.data.initialPassword, parsed.data.username);
    if (policy) {
      setError(
        policy === 'TOO_SHORT'
          ? `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`
          : policy === 'INSUFFICIENT_VARIETY'
            ? '비밀번호는 영문/숫자/특수 중 3종 이상을 포함해야 합니다.'
            : 'username 을 비밀번호에 포함할 수 없습니다.',
      );
      return;
    }

    let created;
    try {
      created = await create.mutateAsync(parsed.data);
    } catch (err) {
      setError(apiErrorMessage(err));
      return;
    }

    // 그룹 배정은 계정을 만든 뒤 **그룹 인원 추가 API 를 그대로 불러서** 한다. 그 API 가
    // 이미 검증과 감사로그(GROUP_MEMBER_ADD)를 올바로 처리하므로, 같은 일을 사용자 생성
    // 쪽에 복제하면 규칙이 두 벌이 되어 갈라진다. 갓 만든 계정은 소속이 없으므로 move 는
    // 필요 없다.
    //
    // 계정은 만들어졌는데 이 단계가 실패할 수 있다. 그때 "생성되었습니다" 로 끝내면 소속이
    // 빈 채로 조용히 남으므로, 무엇이 됐고 무엇이 안 됐는지 문구로 갈라 알린다.
    if (groupId) {
      try {
        await api.post(`/admin/groups/${groupId}/members`, {
          userIds: [created.id],
          move: false,
        });
        await qc.invalidateQueries({ queryKey: groupsKey });
      } catch (err) {
        toast.error(
          `계정은 만들어졌지만 그룹 배정에 실패했습니다(${apiErrorMessage(err)}). ` +
            '사용자 상세 화면에서 소속을 지정하십시오.',
        );
        onCreated(null, parsed.data.displayName);
        onClose();
        return;
      }
    }

    toast.success('사용자가 생성되었습니다. 첫 로그인 시 비밀번호 변경이 강제됩니다.');
    onCreated(null, parsed.data.displayName);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">사용자 추가</h2>
        <p className="mt-1 text-xs text-slate-500">
          USER 권한으로 생성됩니다. 첫 로그인 시 비밀번호 변경이 강제됩니다.
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder="alice"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            영문/숫자/._- 만 허용. 3~64자. 생성 후 변경 불가.
          </span>
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">표시 이름</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="앨리스"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">초기 비밀번호</span>
          <input
            type="text"
            value={initialPassword}
            onChange={(e) => setInitialPassword(e.target.value)}
            placeholder="초기 비밀번호 입력"
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">소속 그룹</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={tree.isLoading}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">(소속 없음)</option>
            {rows.map(({ group, depth }) => (
              <option key={group.id} value={group.id}>
                {'\u00a0'.repeat(depth * 4)}
                {group.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-slate-500">
            나중에 사용자 상세 화면에서 바꿀 수 있습니다.
          </span>
        </label>

        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            생성
          </button>
        </div>
      </form>
    </div>
  );
}
