import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MAX_TREE_DEPTH, type NodeTreeItem } from '@sam/shared';

export interface NodeRowActionMenuProps {
  node: NodeTreeItem;
  indexAmongSiblings: number;
  siblingCount: number;
  subtreeMaxDepth?: number | undefined;
  canCreate?: boolean | undefined;
  canDelete?: boolean | undefined;
  onEdit?: ((node: NodeTreeItem) => void) | undefined;
  onMoveSibling?: ((node: NodeTreeItem, direction: -1 | 1) => void) | undefined;
  onAddChild?: ((node: NodeTreeItem) => void) | undefined;
  onAddSibling?: ((node: NodeTreeItem) => void) | undefined;
  onChangeParent?: ((node: NodeTreeItem) => void) | undefined;
  onDelete?: ((node: NodeTreeItem) => void) | undefined;
}

export default function NodeRowActionMenu({
  node,
  indexAmongSiblings,
  siblingCount,
  subtreeMaxDepth,
  canCreate = true,
  canDelete = true,
  onEdit,
  onMoveSibling,
  onAddChild,
  onAddSibling,
  onChangeParent,
  onDelete,
}: NodeRowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isItem = node.kind === 'ITEM';
  const childWouldExceedDepth = node.depth + 1 >= MAX_TREE_DEPTH;
  const childDisabled = childWouldExceedDepth || isItem;
  const currentSubtreeDepth = subtreeMaxDepth !== undefined ? subtreeMaxDepth - node.depth + 1 : 1;

  const updatePosition = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 176; // w-44 = 176px
      let left = rect.right - menuWidth;
      if (left < 8) left = 8;
      let top = rect.bottom + 4;
      if (top + 260 > window.innerHeight && rect.top - 260 > 0) {
        top = rect.top - 260;
      }
      setCoords({ top, left });
    }
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleScrollOrResize() {
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const handleAction = (actionFn?: () => void) => {
    setIsOpen(false);
    if (actionFn) actionFn();
  };

  return (
    <div className="relative shrink-0 z-30">
      <button
        ref={btnRef}
        type="button"
        title="추가 옵션"
        onClick={toggleMenu}
        className={`flex h-6 w-6 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-all ${
          isOpen
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-hover/row:opacity-100 group-hover/row:pointer-events-auto'
        }`}
      >
        ⋯
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px` }}
          className="w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 z-[9999] text-xs animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              type="button"
              onClick={() => handleAction(() => onEdit(node))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <span className="font-mono text-xs w-4">✏️</span>
              <span>일정 수정</span>
            </button>
          )}

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
              disabled={childDisabled}
              title={
                isItem
                  ? '일반 항목(ITEM)에는 자식 일정을 추가할 수 없습니다. 그룹(GROUP)으로 변경 후 시도하세요.'
                  : childWouldExceedDepth
                  ? `최대 깊이(${MAX_TREE_DEPTH})에 도달`
                  : undefined
              }
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
              title={`부모 그룹 변경 (서브트리 깊이 ${currentSubtreeDepth})`}
              onClick={() => handleAction(() => onChangeParent(node))}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <span className="font-mono text-xs w-4">⇄</span>
              <span>부모 그룹 변경</span>
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
        </div>,
        document.body
      )}
    </div>
  );
}

