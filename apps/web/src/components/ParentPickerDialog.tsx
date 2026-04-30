import { useMemo, useState } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';
import { useMoveNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { buildTree, maxDescendantDepth } from './NodeTree';

interface Props {
  projectId: string;
  items: NodeTreeItem[];
  node: NodeTreeItem;
  onClose: () => void;
}

export default function ParentPickerDialog({ projectId, items, node, onClose }: Props) {
  const tree = useMemo(() => buildTree(items), [items]);

  const subtreeMax = useMemo(() => {
    function findDeep(arr: ReturnType<typeof buildTree>): ReturnType<typeof buildTree>[number] | null {
      for (const n of arr) {
        if (n.id === node.id) return n;
        const r = findDeep(n.children);
        if (r) return r;
      }
      return null;
    }
    const t = findDeep(tree);
    return t ? maxDescendantDepth(t) : node.depth;
  }, [tree, node]);

  const subtreeRelative = subtreeMax - node.depth;
  const move = useMoveNode(projectId);
  const [error, setError] = useState<string | null>(null);

  const descendants = useMemo(() => {
    const set = new Set<string>([node.id]);
    const stack = [node.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const it of items) {
        if (it.parentId === cur && !set.has(it.id)) {
          set.add(it.id);
          stack.push(it.id);
        }
      }
    }
    return set;
  }, [items, node]);

  function isDisabled(targetId: string | null, targetDepth: number): { ok: boolean; reason?: string } {
    if (targetId === node.parentId) return { ok: false, reason: '현재 부모와 동일' };
    if (targetId !== null && descendants.has(targetId)) {
      return { ok: false, reason: '자기 자신/자손은 부모로 지정 불가' };
    }
    const newDepth = targetDepth + 1;
    if (newDepth + subtreeRelative >= MAX_TREE_DEPTH) {
      return { ok: false, reason: `이동 시 최대 깊이 ${MAX_TREE_DEPTH} 초과` };
    }
    return { ok: true };
  }

  async function pick(target: NodeTreeItem | null) {
    setError(null);
    const { ok, reason } = isDisabled(target?.id ?? null, target?.depth ?? -1);
    if (!ok) {
      setError(reason ?? '이동할 수 없습니다.');
      return;
    }
    try {
      const newSortOrder = computeAppendSortOrder(items, target?.id ?? null, node.id);
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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">"{node.title}" 의 새 부모 선택</h2>
        <p className="mt-1 text-xs text-slate-500">
          서브트리 깊이 {subtreeRelative + 1}단계. 새 부모 깊이 + {subtreeRelative + 1} ≤ {MAX_TREE_DEPTH}
        </p>

        <div className="mt-3 flex-1 overflow-auto rounded border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={!isDisabled(null, -1).ok}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
            title={isDisabled(null, -1).reason}
          >
            ◇ (루트로 이동)
          </button>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tree.flatMap((root) => renderRows(root, 0))}
          </ul>
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
    const dis = isDisabled(n.id, n.depth);
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
          <span className="text-[10px] text-slate-400">[{n.kind === 'GROUP' ? 'G' : 'I'}]</span>{' '}
          {n.title}
          <span className="ml-1 text-[10px] text-slate-400">d{n.depth}</span>
        </button>
      </li>,
      ...n.children.flatMap((c) => renderRows(c, indent + 1)),
    ];
  }
}

function computeAppendSortOrder(
  items: NodeTreeItem[],
  parentId: string | null,
  excludeId: string,
): number {
  const siblings = items.filter((x) => x.parentId === parentId && x.id !== excludeId);
  return siblings.length + 1;
}
