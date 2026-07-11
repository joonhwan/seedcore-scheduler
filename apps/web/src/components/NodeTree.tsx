import { useMemo } from 'react';
import { MAX_TREE_DEPTH, type NodeKind, type NodeTreeItem } from '@sam/shared';

export interface TreeNode extends NodeTreeItem {
  children: TreeNode[];
}

export function buildTree(items: NodeTreeItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const it of items) byId.set(it.id, { ...it, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of arr) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export function maxDescendantDepth(node: TreeNode): number {
  if (node.children.length === 0) return node.depth;
  return Math.max(...node.children.map(maxDescendantDepth));
}

export interface NodeTreeProps {
  items: NodeTreeItem[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onAddChild: (parent: NodeTreeItem) => void;
  onAddSibling: (sibling: NodeTreeItem) => void;
  onAddRoot: () => void;
  onMoveSibling: (node: NodeTreeItem, direction: -1 | 1) => void;
  onChangeParent: (node: NodeTreeItem) => void;
  onDelete: (node: NodeTreeItem) => void;
}

export default function NodeTree(props: NodeTreeProps) {
  const tree = useMemo(() => buildTree(props.items), [props.items]);

  return (
    <div>
      {props.canEdit && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={props.onAddRoot}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            + 루트 노드
          </button>
        </div>
      )}
      {tree.length === 0 ? (
        <p className="text-sm text-slate-500">등록된 노드가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {tree.map((n, i) => (
            <NodeRow
              key={n.id}
              node={n}
              siblingCount={tree.length}
              indexAmongSiblings={i}
              {...props}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface NodeRowProps extends Omit<NodeTreeProps, 'items'> {
  node: TreeNode;
  siblingCount: number;
  indexAmongSiblings: number;
}

function NodeRow({
  node,
  siblingCount,
  indexAmongSiblings,
  selectedId,
  canEdit,
  onSelect,
  onAddChild,
  onAddSibling,
  onAddRoot,
  onMoveSibling,
  onChangeParent,
  onDelete,
}: NodeRowProps) {
  const isSelected = selectedId === node.id;
  const isGroup = node.kind === 'GROUP';
  const childWouldExceedDepth = node.depth + 1 >= MAX_TREE_DEPTH;
  const subtreeMaxDepth = maxDescendantDepth(node);

  return (
    <li>
      <div
        className={`group relative flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
          isSelected
            ? 'bg-sky-100 dark:bg-sky-900/40'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <KindBadge kind={node.kind} />
          <span className="truncate">{node.title}</span>
          <span className="ml-1 shrink-0 text-[10px] text-slate-400">
            {formatRange(node)}
          </span>
        </button>

        {canEdit && (
          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded bg-slate-100 px-1 py-0.5 shadow-sm group-hover:flex dark:bg-slate-700">
            <IconBtn
              title="위로"
              disabled={indexAmongSiblings === 0}
              onClick={() => onMoveSibling(node, -1)}
            >
              ↑
            </IconBtn>
            <IconBtn
              title="아래로"
              disabled={indexAmongSiblings === siblingCount - 1}
              onClick={() => onMoveSibling(node, 1)}
            >
              ↓
            </IconBtn>
            <IconBtn
              title={
                childWouldExceedDepth
                  ? `최대 깊이(${MAX_TREE_DEPTH})에 도달`
                  : '자식 추가'
              }
              disabled={childWouldExceedDepth}
              onClick={() => onAddChild(node)}
            >
              ↳
            </IconBtn>
            <IconBtn title="형제 추가" onClick={() => onAddSibling(node)}>
              +
            </IconBtn>
            <IconBtn
              title={`부모 변경 (서브트리 깊이 ${subtreeMaxDepth - node.depth + 1})`}
              onClick={() => onChangeParent(node)}
            >
              ⇄
            </IconBtn>
            <IconBtn
              title="삭제"
              onClick={() => onDelete(node)}
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
            >
              ✕
            </IconBtn>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-700">
          {node.children.map((c, i) => (
            <NodeRow
              key={c.id}
              node={c}
              siblingCount={node.children.length}
              indexAmongSiblings={i}
              selectedId={selectedId}
              canEdit={canEdit}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onAddSibling={onAddSibling}
              onAddRoot={onAddRoot}
              onMoveSibling={onMoveSibling}
              onChangeParent={onChangeParent}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function KindBadge({ kind }: { kind: NodeKind }) {
  const cls =
    kind === 'GROUP'
      ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
      : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300';
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {kind === 'GROUP' ? 'G' : 'I'}
    </span>
  );
}

function formatRange(n: NodeTreeItem): string {
  const start = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
  const end = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
  if (!start && !end) return '';
  if (start && end) {
    if (start === end) return start;
    return `${start} ~ ${end}`;
  }
  return start ?? end ?? '';
}

function IconBtn({
  children,
  title,
  disabled,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded border border-transparent px-1.5 py-0.5 text-xs hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:border-slate-700 dark:hover:bg-slate-700 ${className}`}
    >
      {children}
    </button>
  );
}
