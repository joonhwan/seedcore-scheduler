import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem, type NodeHistoryItem } from '@sam/shared';
import { buildTree, maxDescendantDepth, type TreeNode } from './NodeTree';
import { FolderIcon, ItemIcon } from './Icons';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';

export type TimelineUnit = 'day' | 'week' | 'month' | 'quarter';

interface Props {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  onUnitChange?: ((unit: TimelineUnit) => void) | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit?: ((id: string) => void) | undefined;
  jumpToTodayCounter: number; // 변경 시 "오늘로 이동" 트리거
  canEdit?: boolean | undefined;
  onAddChild?: ((parent: NodeTreeItem) => void) | undefined;
  onAddSibling?: ((sibling: NodeTreeItem) => void) | undefined;
  onMoveSibling?: ((node: NodeTreeItem, direction: -1 | 1) => void) | undefined;
  onChangeParent?: ((node: NodeTreeItem) => void) | undefined;
  onDelete?: ((node: NodeTreeItem) => void) | undefined;
  onAddRoot?: (() => void) | undefined;
}

const PPD: Record<TimelineUnit, number> = {
  day: 36,
  week: 10,
  month: 4,
  quarter: 2,
};

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 44;
const PADDING_DAYS = 3;

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!));
}

function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function flattenTree(items: NodeTreeItem[], collapsedIds: Set<string>): TreeNode[] {
  const tree = buildTree(items);
  const out: TreeNode[] = [];
  function walk(arr: TreeNode[]) {
    for (const n of arr) {
      out.push(n);
      if (n.children.length > 0 && !collapsedIds.has(n.id)) {
        walk(n.children);
      }
    }
  }
  walk(tree);
  return out;
}

export default function Timeline({
  items,
  unit,
  onUnitChange,
  selectedId,
  onSelect,
  onEdit,
  jumpToTodayCounter,
  canEdit,
  onAddChild,
  onAddSibling,
  onMoveSibling,
  onChangeParent,
  onDelete,
  onAddRoot,
}: Props) {
  const [labelWidth, setLabelWidth] = useState<number>(() => {
    const saved = localStorage.getItem('sam_gantt_label_width');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) {
        return parsed;
      }
    }
    return 280;
  });

  useEffect(() => {
    localStorage.setItem('sam_gantt_label_width', labelWidth.toString());
  }, [labelWidth]);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = labelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const newWidth = Math.max(150, Math.min(600, startWidth + dx));
      setLabelWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const flat = useMemo(() => {
    const list = flattenTree(items, collapsedIds);
    const emptyNode: TreeNode = {
      id: 'empty-row-placeholder',
      title: '(새 일정 추가...)',
      kind: 'ITEM',
      depth: 0,
      sortOrder: 999999,
      projectId: '',
      parentId: null,
      startAt: null,
      endAt: null,
      progress: 0,
      description: null,
      createdById: '',
      updatedById: '',
      startAtEffective: null,
      endAtEffective: null,
      progressEffective: null,
      createdAt: '',
      updatedAt: '',
      children: [],
    };
    return [...list, emptyNode];
  }, [items, collapsedIds]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const collapseAll = () => {
    const groupIds = items.filter((n) => n.kind === 'GROUP').map((n) => n.id);
    setCollapsedIds(new Set(groupIds));
  };

  const expandAll = () => {
    setCollapsedIds(new Set());
  };

  // 화살표 키 키보드 단축키 바인딩
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input, textarea 등 입력 필드에 포커스가 있을 때는 단축키 처리 제외
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // 스크롤 방지
        if (flat.length === 0) return;

        if (!selectedId) {
          if (e.key === 'ArrowUp') {
            const lastNode = flat[flat.length - 1];
            if (lastNode) onSelect(lastNode.id);
          } else {
            const firstNode = flat[0];
            if (firstNode) onSelect(firstNode.id);
          }
        } else {
          const idx = flat.findIndex((n) => n.id === selectedId);
          if (idx !== -1) {
            if (e.key === 'ArrowUp') {
              if (idx > 0) {
                const prevNode = flat[idx - 1];
                if (prevNode) onSelect(prevNode.id);
              }
            } else {
              if (idx < flat.length - 1) {
                const nextNode = flat[idx + 1];
                if (nextNode) onSelect(nextNode.id);
              }
            }
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedId) {
          const selectedNode = items.find((n) => n.id === selectedId);
          if (selectedNode && selectedNode.kind === 'GROUP') {
            e.preventDefault();
            if (e.key === 'ArrowLeft') {
              setCollapsedIds((prev) => {
                const next = new Set(prev);
                next.add(selectedId);
                return next;
              });
            } else {
              setCollapsedIds((prev) => {
                const next = new Set(prev);
                next.delete(selectedId);
                return next;
              });
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [flat, selectedId, onSelect, items, collapseAll, expandAll]);

  const range = useMemo(() => computeRange(items), [items]);

  const [ppd, setPpd] = useState<number>(PPD[unit]);
  const [hasFitOnLoad, setHasFitOnLoad] = useState(false);
  const lastNotifiedUnitRef = useRef<TimelineUnit>(unit);

  // unit 변경 시 해당 단위의 기본 배율(PPD)로 복원 (부모 컴포넌트 버튼 클릭 시에만)
  useEffect(() => {
    if (unit !== lastNotifiedUnitRef.current) {
      setPpd(PPD[unit]);
      lastNotifiedUnitRef.current = unit;
    }
  }, [unit]);

  const activeUnit = useMemo(() => {
    if (ppd >= 24) return 'day';
    if (ppd >= 6) return 'week';
    if (ppd >= 3) return 'month';
    return 'quarter';
  }, [ppd]);

  // activeUnit 변경 시 부모 컴포넌트에 통보하여 버튼 하이라이트 동기화
  useEffect(() => {
    if (activeUnit !== lastNotifiedUnitRef.current) {
      lastNotifiedUnitRef.current = activeUnit;
      if (onUnitChange) {
        onUnitChange(activeUnit);
      }
    }
  }, [activeUnit, onUnitChange]);

  const totalDays = range ? dayDiff(range.end, range.start) + 1 : 0;
  const totalWidth = Math.max(totalDays * ppd, 240);

  const weekendBands = useMemo(() => {
    if (!range || activeUnit !== 'day') return [];
    const bands: { leftPx: number; widthPx: number; isSunday: boolean }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      const d = new Date(range.start.getTime() + i * 86400000);
      const dayOfWeek = d.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        bands.push({
          leftPx: i * ppd,
          widthPx: ppd,
          isSunday: dayOfWeek === 0,
        });
      }
    }
    return bands;
  }, [range, activeUnit, ppd, totalDays]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });

  const [hoveredX, setHoveredX] = useState<number | null>(null);

  const hoveredDateStr = useMemo(() => {
    if (hoveredX === null || !range) return null;
    const dayOffset = Math.floor(hoveredX / ppd);
    if (dayOffset < 0 || dayOffset >= totalDays) return null;
    const d = new Date(range.start.getTime() + dayOffset * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
    return `${y}-${m}-${day} (${dayOfWeek})`;
  }, [hoveredX, range, ppd, totalDays]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || !scrollerRef.current) {
      setHoveredX(null);
      return;
    }

    if (e.buttons > 0) {
      setHoveredX(null);
      return;
    }

    const rect = scrollerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    if (clientX < labelWidth) {
      setHoveredX(null);
    } else {
      const chartX = clientX + scrollerRef.current.scrollLeft - labelWidth;
      if (chartX > totalWidth) {
        setHoveredX(null);
      } else {
        setHoveredX(chartX);
      }
    }
  };

  const handleMouseLeave = () => {
    setHoveredX(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 좌클릭만 허용
    const target = e.target as HTMLElement;
    // 버튼, 링크, 입력창 등의 인터랙티브 요소는 드래그 스크롤 대상에서 제외
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input') ||
      target.closest('select')
    ) {
      return;
    }
    if (!scrollerRef.current) return;

    setHoveredX(null);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      scrollLeft: scrollerRef.current.scrollLeft,
    };
    e.preventDefault(); // 텍스트 드래그 선택 방지
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!scrollerRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      scrollerRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    };

    const handleWindowMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging]);

  const fitToScreen = () => {
    if (!scrollerRef.current || !range || items.length === 0) return;

    // Find minStart/maxEnd of items
    let minStartStr: string | null = null;
    let maxEndStr: string | null = null;
    for (const n of items) {
      const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
      const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
      if (s && (minStartStr === null || s < minStartStr)) minStartStr = s;
      if (e && (maxEndStr === null || e > maxEndStr)) maxEndStr = e;
    }
    if (!minStartStr || !maxEndStr) return;

    const minStartVal = parseYmd(minStartStr);
    const maxEndVal = parseYmd(maxEndStr);

    // 오늘 날짜를 제외하고 프로젝트 일정의 최소 시작일과 최대 종료일을 기준으로 활성 범위(active range) 계산
    const activeStart = minStartVal;
    const activeEnd = maxEndVal;
    const activeDays = dayDiff(activeEnd, activeStart) + 1;

    const containerWidth = scrollerRef.current.clientWidth;
    const availableWidth = Math.max(containerWidth - labelWidth - 40, 200); // 40px 여백

    // 활성 범위가 화면에 가득 차도록 ppd(Pixels Per Day) 계산
    const calculatedPpd = availableWidth / activeDays;
    const newPpd = Math.max(0.5, Math.min(calculatedPpd, 100)); // 합리적 제한 (최소 0.5px ~ 최대 100px)
    setPpd(newPpd);

    // activeStart가 화면 왼쪽에 위치하도록 스크롤 위치 조정
    const offsetDays = dayDiff(activeStart, range.start);
    const scrollTarget = offsetDays * newPpd - 20; // 20px 왼쪽 마진 포함

    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'auto' });
      }
    }, 50);
  };

  const handleZoom = (zoomIn: boolean) => {
    if (!scrollerRef.current) return;
    const scroller = scrollerRef.current;
    // 현재 화면 중앙 기준 일수(days) 계산
    const centerOffset = scroller.scrollLeft + (scroller.clientWidth - labelWidth) / 2;
    const daysAtCenter = centerOffset / ppd;

    const multiplier = zoomIn ? 1.3 : 1 / 1.3;
    const newPpd = Math.max(0.5, Math.min(ppd * multiplier, 100));
    setPpd(newPpd);

    // 줌 후에도 화면 중앙 기준 일치되도록 스크롤 복원
    const newCenterOffset = daysAtCenter * newPpd;
    const newScrollLeft = newCenterOffset - (scroller.clientWidth - labelWidth) / 2;

    setTimeout(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollLeft = Math.max(0, newScrollLeft);
      }
    }, 10);
  };

  // 페이지 로딩 시(최초 데이터가 매핑되었을 때) 화면 맞춤 자동 실행
  useEffect(() => {
    if (items.length > 0 && !hasFitOnLoad && scrollerRef.current) {
      fitToScreen();
      setHasFitOnLoad(true);
    }
  }, [items, hasFitOnLoad]);

  const lastTodayCounterRef = useRef(jumpToTodayCounter);

  const scrollToToday = (behavior: ScrollBehavior = 'smooth') => {
    if (!scrollerRef.current || !range) return;
    const today = todayUtc();
    const offsetDays = dayDiff(today, range.start);
    if (offsetDays < 0 || offsetDays > totalDays) return;
    const target = offsetDays * ppd - scrollerRef.current.clientWidth / 2 + labelWidth / 2;
    scrollerRef.current.scrollTo({ left: Math.max(0, target), behavior });
  };

  // 사용자가 명시적으로 "오늘로 이동"을 눌렀을 때만 작동하도록 가드 처리
  useEffect(() => {
    if (jumpToTodayCounter !== lastTodayCounterRef.current) {
      lastTodayCounterRef.current = jumpToTodayCounter;
      scrollToToday('smooth');
    }
  }, [jumpToTodayCounter, range, ppd, totalDays]);

  // range가 없는 빈화면 분기 처리 제거

  const headerCells = computeHeaderCells(range, activeUnit, ppd);
  const today = todayUtc();
  const todayOffset = dayDiff(today, range.start);
  const todayInRange = todayOffset >= 0 && todayOffset <= totalDays;

  return (
    <div className="relative group/timeline w-full h-full flex flex-col overflow-hidden">
      {/* 플로팅 확대/축소/화면맞춤 조절바 - 화면 밖으로 나가면 뷰포트 맨 아래에 sticky 표시 (헤더를 가리지 않도록 top-[48px] 설정) */}
      <div className="pointer-events-none absolute inset-x-0 top-[48px] bottom-0 z-30">
        <div className="sticky bottom-4 flex justify-end pr-4">
          <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 opacity-50 hover:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={() => handleZoom(false)}
              className="flex h-7 w-7 items-center justify-center rounded text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              title="축소 (-)"
            >
              －
            </button>
            <button
              type="button"
              onClick={() => handleZoom(true)}
              className="flex h-7 w-7 items-center justify-center rounded text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              title="확대 (+)"
            >
              ＋
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              type="button"
              onClick={fitToScreen}
              className="flex h-7 px-2 items-center justify-center rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              title="화면에 꽉 차게 맞춤"
            >
              화면 맞춤
            </button>
            {todayInRange && (
              <>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                <button
                  type="button"
                  onClick={() => scrollToToday('smooth')}
                  className="flex h-7 px-2 items-center justify-center rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  title="오늘 날짜 위치로 스크롤"
                >
                  오늘
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 트리 폭 조절 드래그 핸들 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 bottom-0 z-30 w-2 -ml-1 cursor-col-resize hover:bg-sky-500/30 active:bg-sky-600 transition-colors"
        style={{ left: labelWidth }}
      />

      <div
        ref={scrollerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={`flex-1 min-h-0 overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${
          isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
      >
        <div
          className="relative"
          style={{ width: labelWidth + totalWidth }}
        >
          {/* Sticky 상단 헤더 (label corner + 일자 헤더) */}
          <div
            className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-between"
              style={{ width: labelWidth }}
              title={`총 ${items.length}개의 일정이 있습니다.`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate">일정</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                  ({items.length}개)
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                {canEdit && onAddRoot && (
                  <button
                    type="button"
                    onClick={onAddRoot}
                    className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="최상단 항목 추가"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                      <title>최상단 항목 추가</title>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={collapseAll}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="모든 일정 접기"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                    <title>모든 일정 접기</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5m-15 6l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={expandAll}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="모든 일정 펼치기"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                    <title>모든 일정 펼치기</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25l-7.5 7.5-7.5-7.5m15 6l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative" style={{ width: totalWidth }}>
              {hoveredX !== null && hoveredDateStr && (
                <div
                  className="pointer-events-none absolute z-40 rounded bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md dark:bg-sky-500 whitespace-nowrap transition-all duration-75"
                  style={{
                    left: hoveredX + 12,
                    top: 8,
                  }}
                >
                  {hoveredDateStr}
                </div>
              )}
              {headerCells.map((c, i) => (
                <div
                  key={i}
                  className={`absolute top-0 flex h-full border-l border-slate-200 text-[11px] font-medium dark:border-slate-700 ${
                    c.isSaturday
                      ? 'bg-blue-500/[0.04] text-blue-600 dark:bg-blue-500/[0.06] dark:text-blue-400'
                      : c.isSunday
                      ? 'bg-rose-500/[0.04] text-rose-600 dark:bg-rose-500/[0.06] dark:text-rose-400'
                      : 'text-slate-600 dark:text-slate-400'
                  } ${
                    c.subLabel
                      ? 'flex-col justify-center items-center gap-0 px-0.5'
                      : 'items-center px-1.5'
                  }`}
                  style={{ left: c.offsetPx, width: c.widthPx }}
                  title={c.tooltip || c.label}
                >
                  <span className="truncate">{c.label}</span>
                  {c.subLabel && (
                    <span className="text-[9px] font-normal opacity-75">{c.subLabel}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 행 영역 */}
          <div className="relative">
            {hoveredX !== null && (
              <>
                {/* 날짜 영역 하이라이트 세로 밴드 */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 bg-sky-500/[0.03] dark:bg-sky-400/[0.03] z-10"
                  style={{
                    left: labelWidth + Math.floor(hoveredX / ppd) * ppd,
                    width: ppd,
                  }}
                />
                {/* 마우스 포인터 위치의 정밀 세로 점선 */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-sky-400/50 dark:bg-sky-500/50 z-10 border-l border-dashed border-sky-400/80 dark:border-sky-500/80"
                  style={{ left: labelWidth + hoveredX }}
                />
              </>
            )}
            {/* 주말 세로 하이라이트 배경선 */}
            {weekendBands.map((band, idx) => (
              <div
                key={idx}
                className={`absolute top-0 bottom-0 pointer-events-none ${
                  band.isSunday
                    ? 'bg-rose-500/[0.03] dark:bg-rose-500/[0.05]'
                    : 'bg-blue-500/[0.03] dark:bg-blue-500/[0.05]'
                }`}
                style={{ left: labelWidth + band.leftPx, width: band.widthPx }}
              />
            ))}
            {flat.map((n) => {
              const tree = buildTree(items);
              const siblings = n.parentId
                ? (flat.find((p) => p.id === n.parentId) as any)?.children ?? []
                : tree;
              const siblingCount = siblings.length;
              const indexAmongSiblings = siblings.findIndex((s: any) => s.id === n.id);

              return (
                <Row
                  key={n.id}
                  node={n}
                  range={range}
                  ppd={ppd}
                  totalWidth={totalWidth}
                  labelWidth={labelWidth}
                  isSelected={selectedId === n.id}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onHoverNode={setHoveredNode}
                  canEdit={canEdit}
                  siblingCount={siblingCount}
                  indexAmongSiblings={indexAmongSiblings}
                  isCollapsed={collapsedIds.has(n.id)}
                  onToggleCollapse={toggleCollapse}
                  onAddChild={onAddChild}
                  onAddSibling={onAddSibling}
                  onMoveSibling={onMoveSibling}
                  onChangeParent={onChangeParent}
                  onDelete={onDelete}
                  onAddRoot={onAddRoot}
                />
              );
            })}
            {todayInRange && (
              <div
                ref={todayRef}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500 z-10"
                style={{ left: labelWidth + todayOffset * ppd }}
              />
            )}
          </div>
        </div>
        {hoveredNode && (
          <HistoryTooltip
            nodeId={hoveredNode.id}
            nodeTitle={hoveredNode.title}
            x={hoveredNode.x}
            y={hoveredNode.y}
          />
        )}
      </div>
    </div>
  );
}

function Row({
  node,
  range,
  ppd,
  totalWidth,
  labelWidth,
  isSelected,
  onSelect,
  onEdit,
  onHoverNode,
  canEdit,
  siblingCount,
  indexAmongSiblings,
  isCollapsed,
  onToggleCollapse,
  onAddChild,
  onAddSibling,
  onMoveSibling,
  onChangeParent,
  onDelete,
  onAddRoot,
}: {
  node: TreeNode;
  range: { start: Date; end: Date };
  ppd: number;
  totalWidth: number;
  labelWidth: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit?: ((id: string) => void) | undefined;
  onHoverNode: (hover: { id: string; title: string; x: number; y: number } | null) => void;
  canEdit?: boolean | undefined;
  siblingCount: number;
  indexAmongSiblings: number;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onAddChild?: ((parent: NodeTreeItem) => void) | undefined;
  onAddSibling?: ((sibling: NodeTreeItem) => void) | undefined;
  onMoveSibling?: ((node: NodeTreeItem, direction: -1 | 1) => void) | undefined;
  onChangeParent?: ((node: NodeTreeItem) => void) | undefined;
  onDelete?: ((node: NodeTreeItem) => void) | undefined;
  onAddRoot?: (() => void) | undefined;
}) {
  const isGroup = node.kind === 'GROUP';
  const start = isGroup ? node.startAtEffective : node.startAt;
  const end = isGroup ? node.endAtEffective : node.endAt;
  const progress = isGroup ? node.progressEffective : node.progress;
  const isEmptyRow = node.id === 'empty-row-placeholder';

  const childWouldExceedDepth = node.depth + 1 >= MAX_TREE_DEPTH;
  const subtreeMaxDepth = maxDescendantDepth(node);

  let bar: { leftPx: number; widthPx: number } | null = null;
  if (start && end) {
    const s = parseYmd(start);
    const e = parseYmd(end);
    const offset = dayDiff(s, range.start);
    const span = dayDiff(e, s) + 1; // 시작일/종료일 포함
    bar = {
      leftPx: offset * ppd,
      widthPx: Math.max(span * ppd, 2),
    };
  }

  return (
    <div
      className="group/row flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className={`sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-slate-200 px-2 text-left text-xs dark:border-slate-700 relative ${
          isSelected
            ? 'bg-sky-50 dark:bg-sky-950'
            : 'bg-white dark:bg-slate-900 group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-800'
        }`}
        style={{ width: labelWidth, paddingLeft: 8 + node.depth * 16 }}
      >
        {/* 접기/펼치기 토글 버튼 */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {isGroup && node.children.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(node.id);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              aria-label={isCollapsed ? '펼치기' : '접기'}
            >
              <svg
                className={`w-4 h-4 fill-current transition-transform duration-150 ${
                  isCollapsed ? '' : 'rotate-90'
                }`}
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => {
            if (isEmptyRow) {
              onAddRoot?.();
            } else {
              onEdit?.(node.id);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left select-none"
        >
          <span className="shrink-0 flex items-center justify-center">
            {isEmptyRow ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 dark:text-slate-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            ) : isGroup ? (
              <FolderIcon className="w-4 h-4" />
            ) : (
              <ItemIcon className="w-4 h-4" />
            )}
          </span>
          <span
            className={`min-w-0 flex-1 truncate ${
              isEmptyRow ? 'text-slate-400 dark:text-slate-500 italic' : ''
            }`}
            title={isEmptyRow ? '새 일정을 추가하려면 더블클릭하거나 단축키(Ctrl-I)를 입력하세요.' : node.title}
          >
            {node.title}
          </span>
          {progress !== null && (
            <span className="shrink-0 font-mono text-[10px] text-slate-500 mr-1">
              {progress}%
            </span>
          )}
        </button>

        {canEdit && !isEmptyRow && (
          <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 shadow-sm group-hover/row:flex dark:bg-slate-700 z-20">
            <IconBtn
              title="위로"
              disabled={indexAmongSiblings === 0}
              onClick={() => onMoveSibling?.(node, -1)}
            >
              ↑
            </IconBtn>
            <IconBtn
              title="아래로"
              disabled={indexAmongSiblings === siblingCount - 1}
              onClick={() => onMoveSibling?.(node, 1)}
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
              onClick={() => onAddChild?.(node)}
            >
              ↳
            </IconBtn>
            <IconBtn title="형제 추가" onClick={() => onAddSibling?.(node)}>
              +
            </IconBtn>
            <IconBtn
              title={`부모 변경 (서브트리 깊이 ${subtreeMaxDepth - node.depth + 1})`}
              onClick={() => onChangeParent?.(node)}
            >
              ⇄
            </IconBtn>
            <IconBtn
              title="삭제"
              onClick={() => onDelete?.(node)}
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
            >
              ✕
            </IconBtn>
          </div>
        )}
      </div>
      <div className="relative" style={{ width: totalWidth }}>
        {bar && (
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => {
              if (isEmptyRow) {
                onAddRoot?.();
              } else {
                onEdit?.(node.id);
              }
            }}
            onMouseEnter={(e) => {
              onHoverNode({
                id: node.id,
                title: node.title,
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseMove={(e) => {
              onHoverNode({
                id: node.id,
                title: node.title,
                x: e.clientX,
                y: e.clientY,
              });
            }}
            onMouseLeave={() => {
              onHoverNode(null);
            }}
            className={`absolute top-1 bottom-1 overflow-hidden rounded ${
              isGroup
                ? 'border border-violet-300 bg-violet-100/70 dark:border-violet-700 dark:bg-violet-900/40'
                : 'border border-sky-400 bg-sky-100 dark:border-sky-700 dark:bg-sky-900/40'
            }`}
            style={{ left: bar.leftPx, width: bar.widthPx }}
            title={`${start} ~ ${end}${progress !== null ? ` · ${progress}%` : ''}`}
          >
            {progress !== null && progress > 0 && (
              <div
                className={`h-full ${isGroup ? 'bg-violet-400/70' : 'bg-sky-500/80'}`}
                style={{ width: `${progress}%` }}
              />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function computeRange(items: NodeTreeItem[]): { start: Date; end: Date } {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const n of items) {
    const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
    const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
    if (s && (minStart === null || s < minStart)) minStart = s;
    if (e && (maxEnd === null || e > maxEnd)) maxEnd = e;
  }

  let start: Date;
  let end: Date;

  if (minStart && maxEnd) {
    start = parseYmd(minStart);
    end = parseYmd(maxEnd);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    // 날짜가 입력된 노드가 하나도 없는 경우(빈 프로젝트 포함), 오늘을 기준으로 +- 6개월 임시 범위 제공
    const today = todayUtc();
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 6, 1));
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 6, 1));
  }

  return { start, end };
}

interface HeaderCell {
  offsetPx: number;
  widthPx: number;
  label: string;
  subLabel?: string | undefined;
  tooltip?: string | undefined;
  isSaturday?: boolean | undefined;
  isSunday?: boolean | undefined;
}

function computeHeaderCells(
  range: { start: Date; end: Date },
  unit: TimelineUnit,
  ppd: number,
): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const totalDays = dayDiff(range.end, range.start) + 1;

  if (unit === 'day') {
    const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < totalDays; i += 1) {
      const d = new Date(range.start.getTime() + i * 86400000);
      const day = d.getUTCDate();
      const dayOfWeek = d.getUTCDay();
      const showDow = ppd >= 30;
      cells.push({
        offsetPx: i * ppd,
        widthPx: ppd,
        label: `${day}`,
        subLabel: showDow ? dowNames[dayOfWeek] : undefined,
        tooltip: `${d.getUTCMonth() + 1}/${day} (${dowNames[dayOfWeek]})`,
        isSaturday: dayOfWeek === 6,
        isSunday: dayOfWeek === 0,
      });
    }
    return cells;
  }
  if (unit === 'week') {
    // 주 시작 (월요일) 기준
    let cursor = new Date(range.start);
    const dow = cursor.getUTCDay();
    const back = (dow + 6) % 7; // 월=0, 일=6
    cursor = new Date(cursor.getTime() - back * 86400000);
    while (cursor < range.end) {
      const next = new Date(cursor.getTime() + 7 * 86400000);
      const offsetDays = dayDiff(cursor, range.start);
      const widthDays = Math.min(7, totalDays - offsetDays);
      const label = `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`;
      cells.push({
        offsetPx: Math.max(0, offsetDays * ppd),
        widthPx: widthDays * ppd,
        label,
      });
      cursor = next;
    }
    return cells;
  }
  if (unit === 'month') {
    let y = range.start.getUTCFullYear();
    let m = range.start.getUTCMonth();
    while (true) {
      const cellStart = new Date(Date.UTC(y, m, 1));
      const cellEnd = new Date(Date.UTC(y, m + 1, 1));
      if (cellStart >= range.end) break;
      const offsetDays = Math.max(0, dayDiff(cellStart, range.start));
      const endDays = Math.min(dayDiff(cellEnd, range.start), totalDays);
      cells.push({
        offsetPx: offsetDays * ppd,
        widthPx: (endDays - offsetDays) * ppd,
        label: `${y}-${(m + 1).toString().padStart(2, '0')}`,
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return cells;
  }
  // quarter
  let y = range.start.getUTCFullYear();
  let q = Math.floor(range.start.getUTCMonth() / 3);
  while (true) {
    const startMonth = q * 3;
    const cellStart = new Date(Date.UTC(y, startMonth, 1));
    const cellEnd = new Date(Date.UTC(y, startMonth + 3, 1));
    if (cellStart >= range.end) break;
    const offsetDays = Math.max(0, dayDiff(cellStart, range.start));
    const endDays = Math.min(dayDiff(cellEnd, range.start), totalDays);
    cells.push({
      offsetPx: offsetDays * ppd,
      widthPx: (endDays - offsetDays) * ppd,
      label: `${y} Q${q + 1}`,
    });
    q += 1;
    if (q > 3) {
      q = 0;
      y += 1;
    }
  }
  return cells;
}

function HistoryTooltip({
  nodeId,
  nodeTitle,
  x,
  y,
}: {
  nodeId: string;
  nodeTitle: string;
  x: number;
  y: number;
}) {
  const { data: history, isLoading, isError, error } = useNodeHistory(nodeId);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x + 15, top: y + 15 });

  useEffect(() => {
    if (!tooltipRef.current) return;
    const width = tooltipRef.current.clientWidth;
    const height = tooltipRef.current.clientHeight;
    let left = x + 15;
    let top = y + 15;

    if (left + width > window.innerWidth) {
      left = x - width - 15;
    }
    if (top + height > window.innerHeight) {
      top = y - height - 15;
    }

    setCoords({ left, top });
  }, [x, y, history]);

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-50 max-w-sm rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-100 shadow-xl backdrop-blur-sm transition-all duration-75"
      style={{ left: coords.left, top: coords.top }}
    >
      <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1.5 mb-1.5">
        {nodeTitle}
      </div>
      {isLoading && <p className="text-slate-400">마지막 이력 불러오는 중...</p>}
      {isError && <p className="text-rose-400">{apiErrorMessage(error)}</p>}
      {history && history.length === 0 && (
        <p className="text-slate-400">변경 이력이 없습니다.</p>
      )}
      {history && history.length > 0 && (
        <div>
          <LatestHistoryDetail item={history[0]!} />
        </div>
      )}
    </div>
  );
}

function LatestHistoryDetail({ item }: { item: NodeHistoryItem }) {
  const diff = item.diff as Record<string, unknown>;
  const entries = Object.entries(diff).filter(
    ([, v]) =>
      v !== null &&
      typeof v === 'object' &&
      'from' in (v as object) &&
      'to' in (v as object),
  ) as Array<[string, { from: unknown; to: unknown }]>;

  const dateStr = new Date(item.occurredAt).toLocaleString();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          item.action === 'CREATE' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
          item.action === 'UPDATE' ? 'bg-sky-950 text-sky-300 border border-sky-800' :
          item.action === 'MOVE' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
          item.action === 'DELETE' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
          'bg-violet-950 text-violet-300 border border-violet-800'
        }`}>
          {item.action}
        </span>
        <span className="font-semibold text-slate-300">
          {item.actorDisplayName}
        </span>
        <span className="text-slate-500 text-[10px]">
          @{item.actorUsername}
        </span>
      </div>
      <div className="text-[10px] text-slate-400">{dateStr}</div>
      <div className="mt-1.5 border-t border-slate-800/80 pt-1.5">
        {entries.length === 0 ? (
          item.action === 'DELETE' ? (
            <p className="text-slate-400">노드가 삭제되었습니다.</p>
          ) : (
            <p className="text-slate-500">(변경 내용 없음)</p>
          )
        ) : (
          <ul className="space-y-0.5 max-h-32 overflow-y-auto">
            {entries.map(([field, fromTo]) => (
              <li key={field} className="text-[11px] truncate">
                <span className="text-slate-500">{field}:</span>{' '}
                <span className="text-rose-400 line-through">
                  {formatTooltipVal(fromTo.from)}
                </span>{' '}
                ➔{' '}
                <span className="text-emerald-400">
                  {formatTooltipVal(fromTo.to)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTooltipVal(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 30 ? `${v.slice(0, 30)}…` : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
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
      className={`rounded border border-transparent px-1 py-0.5 text-[10px] hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:border-slate-700 dark:hover:bg-slate-700 ${className}`}
    >
      {children}
    </button>
  );
}
