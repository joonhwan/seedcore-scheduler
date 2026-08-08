import { useMemo, useState } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';
import { useMoveNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { canDropInto, appendSortOrder, subtreeRelativeDepth } from '../lib/treeDnd';
import { buildTree } from './NodeTree';

interface Props {
  projectId: string;
  items: NodeTreeItem[];
  node: NodeTreeItem;
  onClose: () => void;
}

export default function ParentPickerDialog({ projectId, items, node, onClose }: Props) {
  const tree = useMemo(() => buildTree(items), [items]);

  const subtreeRelative = useMemo(() => subtreeRelativeDepth(items, node.id), [items, node.id]);
  const move = useMoveNode(projectId);
  const [error, setError] = useState<string | null>(null);

  function isDisabled(targetId: string | null): { ok: boolean; reason?: string } {
    // 목록에서 현재 부모를 다시 고르는 건 의미가 없다. 이건 판정이 아니라 목록 UI 의 사정이라
    // 공용 canDropInto 가 아니라 여기서 본다.
    if (targetId === node.parentId) return { ok: false, reason: '현재 부모와 동일' };
    return canDropInto(items, node, targetId);
  }

  async function pick(target: NodeTreeItem | null) {
    setError(null);
    const { ok, reason } = isDisabled(target?.id ?? null);
    if (!ok) {
      setError(reason ?? '이동할 수 없습니다.');
      return;
    }
    try {
      const newSortOrder = appendSortOrder(items, target?.id ?? null, node.id);
      await move.mutateAsync({
        id: node.id,
        body: {
          newParentId: target?.id ?? null,
          newSortOrder,
          expectedUpdatedAt: node.updatedAt,
        },
      });
      toast.success('노드가 이동되었습니다.');
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // ITEM 은 자식을 가질 수 없으므로 목록에는 GROUP 만 남긴다 (renderRows 가 걸러낸다).
  const groupRows = tree.flatMap((root) => renderRows(root, 0));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">"{node.title}" 의 새 부모 그룹 선택</h2>
        <p className="mt-1 text-xs text-slate-500">
          ITEM은 하위 노드를 가질 수 없으므로 GROUP 만 고를 수 있습니다. 서브트리 깊이{' '}
          {subtreeRelative + 1}단계. 새 부모 깊이 + {subtreeRelative + 1} ≤ {MAX_TREE_DEPTH}
        </p>

        <div className="mt-3 flex-1 overflow-auto rounded border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={!isDisabled(null).ok}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
            title={isDisabled(null).reason}
          >
            ◇ 최상위 (그룹 없이 최상위로 이동)
          </button>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {groupRows}
          </ul>
          {groupRows.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-500">
              선택할 수 있는 GROUP 이 없습니다. 최상위로만 옮길 수 있습니다.
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  function renderRows(
    n: ReturnType<typeof buildTree>[number],
    indent: number,
  ): React.ReactNode[] {
    // ITEM 은 부모가 될 수 없으니 행 자체를 만들지 않는다. 자식이 있을 리 없지만
    // 방어적으로 같은 들여쓰기 단계에서 이어서 훑는다.
    if (n.kind !== 'GROUP') {
      return n.children.flatMap((c) => renderRows(c, indent));
    }
    const dis = isDisabled(n.id);
    return [
      <li key={n.id}>
        <button
          type="button"
          onClick={() => pick(n)}
          disabled={!dis.ok}
          title={dis.reason}
          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
          style={{ paddingLeft: 12 + indent * 16 }}
        >
          <span className="text-[10px] text-slate-400">[G]</span> {n.title}
          <span className="ml-1 text-[10px] text-slate-400">d{n.depth}</span>
        </button>
      </li>,
      ...n.children.flatMap((c) => renderRows(c, indent + 1)),
    ];
  }
}
