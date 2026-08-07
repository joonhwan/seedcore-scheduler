import { useState, useRef, useEffect } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';

export interface NodeRowActionMenuProps {
  node: NodeTreeItem;
  indexAmongSiblings: number;
  siblingCount: number;
  subtreeMaxDepth?: number;
  canCreate?: boolean;
  canDelete?: boolean;
  onMoveSibling?: (node: NodeTreeItem, direction: -1 | 1) => void;
  onAddChild?: (node: NodeTreeItem) => void;
  onAddSibling?: (node: NodeTreeItem) => void;
  onChangeParent?: (node: NodeTreeItem) => void;
  onDelete?: (node: NodeTreeItem) => void;
}

export default function NodeRowActionMenu({
  node,
  indexAmongSiblings,
  siblingCount,
  subtreeMaxDepth,
  canCreate = true,
  canDelete = true,
  onMoveSibling,
  onAddChild,
  onAddSibling,
  onChangeParent,
  onDelete,
}: NodeRowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const childWouldExceedDepth = node.depth + 1 >= MAX_TREE_DEPTH;
  const currentSubtreeDepth = subtreeMaxDepth !== undefined ? subtreeMaxDepth - node.depth + 1 : 1;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (actionFn?: () => void) => {
    setIsOpen(false);
    if (actionFn) actionFn();
  };

  return (
    <div ref={menuRef} className="relative shrink-0 z-30">
      <button
        type="button"
        title="추가 옵션"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`flex h-6 w-6 items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs transition-colors ${
          isOpen ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover/row:opacity-100'
        }`}
      >
        ⋯
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-7 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-50 text-xs animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onMoveSibling && (
            <>
              <button
                type="button"
                disabled={indexAmongSiblings === 0}
                onClick={() => handleAction(() => onMoveSibling(node, -1))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700/60"
              >
                <span className="font-mono text-xs w-4">↑</span>
                <span>위로 이동</span>
              </button>
              <button
                type="button"
                disabled={indexAmongSiblings === siblingCount - 1}
                onClick={() => handleAction(() => onMoveSibling(node, 1))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700/60"
              >
                <span className="font-mono text-xs w-4">↓</span>
                <span>아래로 이동</span>
              </button>
            </>
          )}

          {canCreate && onAddChild && (
            <button
              type="button"
              disabled={childWouldExceedDepth}
              title={childWouldExceedDepth ? `최대 깊이(${MAX_TREE_DEPTH})에 도달` : undefined}
              onClick={() => handleAction(() => onAddChild(node))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <span className="font-mono text-xs w-4">↳</span>
              <span>자식 일정 추가</span>
            </button>
          )}

          {canCreate && onAddSibling && (
            <button
              type="button"
              onClick={() => handleAction(() => onAddSibling(node))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <span className="font-mono text-xs w-4">+</span>
              <span>형제 일정 추가</span>
            </button>
          )}

          {onChangeParent && (
            <button
              type="button"
              title={`부모 변경 (서브트리 깊이 ${currentSubtreeDepth})`}
              onClick={() => handleAction(() => onChangeParent(node))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <span className="font-mono text-xs w-4">⇄</span>
              <span>부모 일정 변경</span>
            </button>
          )}

          {canDelete && onDelete && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-700/50" />
              <button
                type="button"
                onClick={() => handleAction(() => onDelete(node))}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <span className="font-mono text-xs w-4">✕</span>
                <span>일정 삭제</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
