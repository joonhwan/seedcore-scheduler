import { useState, useMemo } from 'react';
import { MAX_TREE_DEPTH, getNodeDelayInfo, type NodeKind, type NodeTreeItem } from '@sam/shared';
import DelayStatusBadge from './DelayStatusBadge';
import ProgressBarWithExpected from './ProgressBarWithExpected';

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
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const tree = useMemo(() => buildTree(props.items), [props.items]);

  // 지연 노드 수 체크
  const delayedCount = useMemo(() => {
    return props.items.filter((item) => {
      const info = getNodeDelayInfo(item, undefined, props.items);
      return info.status === 'CRITICAL' || info.status === 'WARNING';
    }).length;
  }, [props.items]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {delayedCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyDelayed(!onlyDelayed)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors flex items-center gap-1 ${
                onlyDelayed
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400'
              }`}
            >
              <span>⚠️ 지연 항목만 ({delayedCount})</span>
            </button>
          )}
        </div>

        {props.canEdit && (
          <button
            type="button"
            onClick={props.onAddRoot}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 font-medium"
          >
            + 루트 노드
          </button>
        )}
      </div>

      {tree.length === 0 ? (
        <p className="text-sm text-slate-500">등록된 노드가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {tree.map((n, i) => (
            <NodeRow
              key={n.id}
              node={n}
              allItems={props.items}
              siblingCount={tree.length}
              indexAmongSiblings={i}
              onlyDelayed={onlyDelayed}
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
  allItems: NodeTreeItem[];
  siblingCount: number;
  indexAmongSiblings: number;
  onlyDelayed: boolean;
}

function NodeRow({
  node,
  allItems,
  siblingCount,
  indexAmongSiblings,
  selectedId,
  canEdit,
  onlyDelayed,
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

  const delayInfo = getNodeDelayInfo(node, undefined, allItems);

  const isDelayed = delayInfo.status === 'CRITICAL' || delayInfo.status === 'WARNING';
  const isCritical = delayInfo.status === 'CRITICAL';

  // 자손 중에 지연된 노드가 있는지 확인
  const hasDelayedDescendant = useMemo(() => {
    const check = (n: TreeNode): boolean => {
      const info = getNodeDelayInfo(n, undefined, allItems);
      if (info.status === 'CRITICAL' || info.status === 'WARNING') return true;
      return n.children.some(check);
    };
    return node.children.some(check);
  }, [node, allItems]);


  // "지연 항목만" 필터링 시, 본인이 지연되었거나 자손이 지연된 경우만 표시
  if (onlyDelayed && !isDelayed && !hasDelayedDescendant) {
    return null;
  }

  let rowBgClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/60';
  if (isSelected) {
    rowBgClass = 'bg-sky-100/90 dark:bg-sky-900/50 ring-1 ring-sky-400';
  } else if (isCritical) {
    rowBgClass = 'bg-red-500/10 hover:bg-red-500/15 dark:bg-red-950/25 border-l-2 border-red-500';
  } else if (isDelayed) {
    rowBgClass = 'bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-950/20 border-l-2 border-amber-500';
  }

  return (
    <li>
      <div
        className={`group relative flex items-center gap-2 rounded px-2.5 py-1.5 text-sm transition-all ${rowBgClass}`}
      >
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <KindBadge kind={node.kind} />
          <span className={`truncate ${isGroup ? 'font-semibold' : ''}`}>
            {node.title}
          </span>

          <span className="ml-1 shrink-0 text-[10px] text-slate-400">
            {formatRange(node)}
          </span>

          {/* 지연 경고 뱃지 */}
          {delayInfo.status !== 'UNKNOWN' && delayInfo.status !== 'ON_TRACK' && (
            <DelayStatusBadge
              status={delayInfo.status}
              delayGap={delayInfo.delayGap}
              size="sm"
              className="ml-auto shrink-0"
            />
          )}

          {/* 미니 프로그레스 바 */}
          <div className="w-24 shrink-0 hidden md:block ml-2">
            <ProgressBarWithExpected
              actualProgress={delayInfo.actualProgress}
              expectedProgress={delayInfo.expectedProgress}
              status={delayInfo.status}
              height="h-1.5"
            />
          </div>
        </button>

        {canEdit && (
          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded bg-slate-100 px-1 py-0.5 shadow-sm group-hover:flex dark:bg-slate-700 z-20">
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
              allItems={allItems}
              siblingCount={node.children.length}
              indexAmongSiblings={i}
              onlyDelayed={onlyDelayed}
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
