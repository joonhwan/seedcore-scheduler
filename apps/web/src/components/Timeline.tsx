import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle, type ForwardedRef } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem, type NodeHistoryItem } from '@sam/shared';
import { buildTree, maxDescendantDepth, type TreeNode } from './NodeTree';
import { FolderIcon, ItemIcon } from './Icons';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';
import { applyDrag, pxToDays, parseYmd, dayDiff, type DragMode } from '../lib/ganttMath';
import { recomputeEffective, diffAffectedGroups } from '../lib/ganttAggregate';
import type { BarChangeProposal } from '../lib/ganttTypes';
import { computeCheckStates, type CheckState } from '../lib/bulkSelection';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  todayUtc,
  flattenTree,
  computeRange,
  computeHeaderCells,
  type TimelineUnit,
} from '../lib/ganttLayout';

export type { TimelineUnit } from '../lib/ganttLayout';

interface Props {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  onUnitChange?: ((unit: TimelineUnit) => void) | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit?: ((id: string) => void) | undefined;
  jumpToTodayCounter: number; // 변경 시 "오늘로 이동" 트리거
  canEdit?: boolean | undefined;
  canCreate?: boolean | undefined; // 생성은 편집보다 강한 권한(MANAGER/관리자 모드)
  canDelete?: boolean | undefined; // 삭제는 편집보다 강한 권한(MANAGER/관리자 모드)
  onAddChild?: ((parent: NodeTreeItem) => void) | undefined;
  onAddSibling?: ((sibling: NodeTreeItem) => void) | undefined;
  onMoveSibling?: ((node: NodeTreeItem, direction: -1 | 1) => void) | undefined;
  onChangeParent?: ((node: NodeTreeItem) => void) | undefined;
  onDelete?: ((node: NodeTreeItem) => void) | undefined;
  onAddRoot?: (() => void) | undefined;
  onAddNode?: (() => void) | undefined; // 선택 노드 기준 스마트 추가(Ctrl-I 와 동일)
  onBarChange?: ((proposal: BarChangeProposal) => void) | undefined;
  previewProposal?: BarChangeProposal | null | undefined;
  // 다중 선택(선택 모드)
  selectedNodeIds?: Set<string> | undefined;
  onToggleNodeSelect?: ((id: string) => void) | undefined;
  onBulkComplete?: (() => void) | undefined;
  onBulkDelete?: (() => void) | undefined;
  onClearSelection?: (() => void) | undefined;
}

const EMPTY_SELECTION: Set<string> = new Set();

// 부모(헤더 툴바)에서 호출하는 줌/화면맞춤 제어 핸들
export interface TimelineHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
}

function TimelineComponent({
  items,
  unit,
  onUnitChange,
  selectedId,
  onSelect,
  onEdit,
  jumpToTodayCounter,
  canEdit,
  canCreate,
  canDelete,
  onAddChild,
  onAddSibling,
  onMoveSibling,
  onChangeParent,
  onDelete,
  onAddRoot,
  onAddNode,
  onBarChange,
  previewProposal,
  selectedNodeIds,
  onToggleNodeSelect,
  onBulkComplete,
  onBulkDelete,
  onClearSelection,
}: Props, ref: ForwardedRef<TimelineHandle>) {
  const selection = selectedNodeIds ?? EMPTY_SELECTION;
  const selectionMode = selection.size > 0;
  const showCheckbox = !!canEdit && !!onToggleNodeSelect;
  const checkStateMap = useMemo(() => computeCheckStates(items, selection), [items, selection]);
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

  // 막대 드래그 편집 상태 (배경 패닝용 isDragging 과 별개)
  const [barDrag, setBarDrag] = useState<{
    nodeId: string;
    mode: DragMode;
    startClientX: number;
    startScrollLeft: number; // 드래그 시작 시점 scrollLeft (자동 스크롤 보정용)
    deltaDays: number;
  } | null>(null);
  // move 드래그 직후 발생하는 click(선택)을 한 번 무시하기 위한 플래그
  const justDraggedRef = useRef(false);

  // 드래그 중(barDrag) 또는 확정 대기 중(previewProposal)이면 대상 ITEM 의 날짜를 바꾼 뒤
  // effective 를 다시 계산한 미리보기 items 를 만든다. 아니면 원본 items 그대로.
  const previewItems = useMemo(() => {
    if (barDrag) {
      const orig = items.find((n) => n.id === barDrag.nodeId);
      if (!orig || !orig.startAt || !orig.endAt) return items;
      const next = applyDrag(orig.startAt, orig.endAt, barDrag.mode, barDrag.deltaDays);
      const mutated = items.map((n) =>
        n.id === barDrag.nodeId ? { ...n, startAt: next.startAt, endAt: next.endAt } : n,
      );
      return recomputeEffective(mutated);
    }
    if (previewProposal) {
      const mutated = items.map((n) =>
        n.id === previewProposal.node.id
          ? { ...n, startAt: previewProposal.newStartAt, endAt: previewProposal.newEndAt }
          : n,
      );
      return recomputeEffective(mutated);
    }
    return items;
  }, [items, barDrag, previewProposal]);

  const flat = useMemo(() => {
    const list = flattenTree(items, collapsedIds);
    const emptyNode: TreeNode = {
      id: 'empty-row-placeholder',
      title: '(최상단 일정 추가...)',
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

  // 미리보기(드래그 반영) 노드를 id 로 빠르게 찾기 위한 맵. 드래그 중이 아니면 previewItems === items.
  const previewMap = useMemo(
    () => new Map(previewItems.map((p) => [p.id, p])),
    [previewItems],
  );

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

      if (selectionMode) return; // 선택 모드에서는 키보드 탐색 차단

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
  }, [flat, selectedId, onSelect, items, collapseAll, expandAll, selectionMode]);

  // 드래그로 막대가 기존 범위를 넘어가면 previewItems 기준으로 range 가 넓어진다(±1년 여유).
  const range = useMemo(() => computeRange(previewItems), [previewItems]);

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
  // 현재 가로 스크롤 위치(px). 오늘선이 라벨 칸 뒤로 넘어갔는지 판단에 쓴다.
  const [scrollLeftPx, setScrollLeftPx] = useState(0);

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
    // 막대 드래그 중에는 드래그 effect 의 window mousemove 가 hover 날짜 선을 관리한다.
    if (barDrag) return;

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
    if (selectionMode) return; // 선택 모드에서는 배경 패닝 차단
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

  // 막대 위 mousedown 에서 호출 — 드래그 시작
  const startBarDrag = (node: NodeTreeItem, mode: DragMode, e: React.MouseEvent) => {
    if (!canEdit || selectionMode || node.kind !== 'ITEM' || !node.startAt || !node.endAt) return;
    e.stopPropagation(); // 배경 패닝/상위 전파 방지
    setBarDrag({
      nodeId: node.id,
      mode,
      startClientX: e.clientX,
      startScrollLeft: scrollerRef.current?.scrollLeft ?? 0,
      deltaDays: 0,
    });
  };

  useEffect(() => {
    if (!barDrag) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let lastClientX = barDrag.startClientX;
    let rafId = 0;

    // 마우스 화면 이동 + 자동 스크롤 이동을 합쳐 deltaDays 를 계산한다(range 원점과 무관).
    // 동시에 hover 날짜 선(파란 점선 + 헤더 날짜)도 갱신한다.
    const applyDelta = (clientX: number) => {
      const movedPx = clientX - barDrag.startClientX + (scroller.scrollLeft - barDrag.startScrollLeft);
      const dd = pxToDays(movedPx, ppd);
      setBarDrag((prev) => (prev && prev.deltaDays !== dd ? { ...prev, deltaDays: dd } : prev));

      const relX = clientX - scroller.getBoundingClientRect().left;
      if (relX < labelWidth) {
        setHoveredX(null);
      } else {
        const chartX = relX + scroller.scrollLeft - labelWidth;
        setHoveredX(chartX >= 0 && chartX <= totalWidth ? chartX : null);
      }
    };

    // 뷰포트 가장자리 근처면 자동 스크롤한다. 마우스가 멈춰 있어도 계속 스크롤되도록 rAF 루프로 돈다.
    const EDGE = 48; // 가장자리 감지 폭(px)
    const MAX_SPEED = 20; // 프레임당 최대 스크롤(px)
    const tick = () => {
      const rect = scroller.getBoundingClientRect();
      const relX = lastClientX - rect.left;
      let speed = 0;
      if (relX < labelWidth + EDGE) {
        speed = -MAX_SPEED * Math.min(1, (labelWidth + EDGE - relX) / EDGE);
      } else if (relX > rect.width - EDGE) {
        speed = MAX_SPEED * Math.min(1, (relX - (rect.width - EDGE)) / EDGE);
      }
      if (speed !== 0) {
        const before = scroller.scrollLeft;
        scroller.scrollLeft = before + speed;
        if (scroller.scrollLeft !== before) applyDelta(lastClientX);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const onMove = (e: MouseEvent) => {
      lastClientX = e.clientX;
      applyDelta(e.clientX);
    };

    const onUp = () => {
      setBarDrag((cur) => {
        if (cur && cur.deltaDays !== 0) {
          const orig = items.find((n) => n.id === cur.nodeId);
          if (orig && orig.startAt && orig.endAt) {
            const next = applyDrag(orig.startAt, orig.endAt, cur.mode, cur.deltaDays);
            if (next.startAt !== orig.startAt || next.endAt !== orig.endAt) {
              const before = recomputeEffective(items);
              const after = recomputeEffective(
                items.map((n) =>
                  n.id === cur.nodeId ? { ...n, startAt: next.startAt, endAt: next.endAt } : n,
                ),
              );
              // move 드래그 직후의 click(선택) 을 한 번 무시
              if (cur.mode === 'move') justDraggedRef.current = true;
              onBarChange?.({
                node: orig,
                newStartAt: next.startAt,
                newEndAt: next.endAt,
                affectedGroups: diffAffectedGroups(before, after),
              });
            }
          }
        }
        return null;
      });
      setHoveredX(null);
    };

    // 드래그 도중 ESC: 확인 모달을 거치지 않고 즉시 취소·원복
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setBarDrag(null);
        setHoveredX(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // deltaDays 는 함수형 업데이트로 다루므로 deps 에서 제외해 리스너 재등록을 줄인다.
  }, [barDrag?.nodeId, barDrag?.startClientX, barDrag?.startScrollLeft, barDrag?.mode, ppd, items, onBarChange, labelWidth, totalWidth]);

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

  // 헤더 툴바가 호출하는 줌/화면맞춤 제어 노출
  useImperativeHandle(ref, () => ({
    zoomIn: () => handleZoom(true),
    zoomOut: () => handleZoom(false),
    fitToScreen,
  }));

  // 키보드 수평 줌: +/= 확대, - 축소 (입력 필드 포커스 시 제외)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectionMode) return; // 선택 모드에서는 줌 차단
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoom(true);
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoom(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // handleZoom 은 ppd/labelWidth 를 참조하므로 이 값들이 바뀌면 최신 클로저로 다시 등록한다.
  }, [ppd, labelWidth, selectionMode]);

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

  // 막대 선택 콜백 — move 드래그 직후의 click 은 한 번 무시한다.
  const handleBarSelect = (id: string) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onSelect(id);
  };

  return (
    <div className="relative group/timeline w-full h-full flex flex-col overflow-hidden">
      {/* 트리 폭 조절 드래그 핸들 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 bottom-0 z-30 w-2 -ml-1 cursor-col-resize hover:bg-sky-500/30 active:bg-sky-600 transition-colors"
        style={{ left: labelWidth }}
      />

      {/* 선택 모드 액션 바 (스플리터 오른쪽, 차트 상단) */}
      {selectionMode && (
        <div
          className="absolute z-40 flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{ left: labelWidth + 8, top: HEADER_HEIGHT + 8 }}
        >
          <span className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {selection.size}개 선택
          </span>
          <button
            type="button"
            onClick={onBulkComplete}
            className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            100% 완료
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
            >
              삭제
            </button>
          )}
          <button
            type="button"
            onClick={onClearSelection}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      <div
        ref={scrollerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onScroll={(e) => setScrollLeftPx(e.currentTarget.scrollLeft)}
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
                {canCreate && onAddNode && (
                  <button
                    type="button"
                    onClick={onAddNode}
                    className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="일정 추가 (Ctrl-I) · 선택된 그룹의 자식 또는 아이템의 형제로 추가"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 pointer-events-none">
                      <title>일정 추가 (Ctrl-I)</title>
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

              // 드래그 미리보기: 이 노드의 변경 예상 시작/종료(원본과 다르면 반투명 막대로 표시)
              const pv = previewMap.get(n.id);
              const previewStart = pv ? (n.kind === 'GROUP' ? pv.startAtEffective : pv.startAt) : null;
              const previewEnd = pv ? (n.kind === 'GROUP' ? pv.endAtEffective : pv.endAt) : null;

              return (
                <Row
                  key={n.id}
                  node={n}
                  range={range}
                  ppd={ppd}
                  totalWidth={totalWidth}
                  labelWidth={labelWidth}
                  isSelected={selectedId === n.id}
                  onSelect={handleBarSelect}
                  onEdit={onEdit}
                  onHoverNode={setHoveredNode}
                  canEdit={canEdit}
                  canCreate={canCreate}
                  canDelete={canDelete}
                  onBarDragStart={startBarDrag}
                  previewStart={previewStart}
                  previewEnd={previewEnd}
                  selectionMode={selectionMode}
                  checkState={checkStateMap.get(n.id) ?? 'unchecked'}
                  showCheckbox={showCheckbox}
                  onToggleSelect={onToggleNodeSelect}
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
            {/* 오늘선: 라벨 칸(sticky) 뒤로 스크롤돼 들어가면 그리지 않는다.
                화면상 위치(labelWidth + todayOffset*ppd - scrollLeftPx)가 labelWidth 미만이면
                라벨 칸이 대부분 덮되 행 사이 1px 틈으로 빨간 점이 새어 보이기 때문. */}
            {todayInRange && todayOffset * ppd >= scrollLeftPx && (
              <div
                ref={todayRef}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500"
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

const Timeline = forwardRef(TimelineComponent);
export default Timeline;

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
  canCreate,
  canDelete,
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
  onBarDragStart,
  previewStart,
  previewEnd,
  selectionMode,
  checkState,
  showCheckbox,
  onToggleSelect,
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
  canCreate?: boolean | undefined;
  canDelete?: boolean | undefined;
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
  onBarDragStart?: ((node: NodeTreeItem, mode: DragMode, e: React.MouseEvent) => void) | undefined;
  previewStart?: string | null | undefined;
  previewEnd?: string | null | undefined;
  selectionMode: boolean;
  checkState: CheckState;
  showCheckbox: boolean;
  onToggleSelect?: ((id: string) => void) | undefined;
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

  // 드래그 미리보기 막대: 변경 예상 위치가 원본과 다를 때만 반투명하게 겹쳐 표시한다.
  let previewBar: { leftPx: number; widthPx: number } | null = null;
  if (previewStart && previewEnd && (previewStart !== start || previewEnd !== end)) {
    const s = parseYmd(previewStart);
    const e = parseYmd(previewEnd);
    const offset = dayDiff(s, range.start);
    const span = dayDiff(e, s) + 1;
    previewBar = {
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
        {/* 다중 선택 체크박스 (hover 또는 선택 모드/선택됨일 때 표시) */}
        {showCheckbox && !isEmptyRow && (
          <input
            type="checkbox"
            checked={checkState === 'checked'}
            ref={(el) => {
              if (el) el.indeterminate = checkState === 'indeterminate';
            }}
            onChange={() => onToggleSelect?.(node.id)}
            onClick={(e) => e.stopPropagation()}
            className={`shrink-0 w-3.5 h-3.5 accent-sky-600 cursor-pointer transition-opacity ${
              selectionMode || checkState !== 'unchecked'
                ? 'opacity-100'
                : 'opacity-0 group-hover/row:opacity-100'
            }`}
            aria-label="항목 선택"
          />
        )}
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
          onClick={() => {
            if (!selectionMode) onSelect(node.id);
          }}
          onDoubleClick={() => {
            if (selectionMode) return;
            if (isEmptyRow) {
              if (canCreate) onAddRoot?.();
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
            title={isEmptyRow ? '이 항목을 선택한 후 Ctrl+I 를 누르거나 더블클릭하면 최상단 일정이 추가됩니다.' : node.title}
          >
            {node.title}
          </span>
          {progress !== null && (
            <span className="shrink-0 font-mono text-[10px] text-slate-500 mr-1">
              {progress}%
            </span>
          )}
        </button>

        {canEdit && !isEmptyRow && !selectionMode && (
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
            {canCreate && (
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
            )}
            {canCreate && (
              <IconBtn title="형제 추가" onClick={() => onAddSibling?.(node)}>
                +
              </IconBtn>
            )}
            <IconBtn
              title={`부모 변경 (서브트리 깊이 ${subtreeMaxDepth - node.depth + 1})`}
              onClick={() => onChangeParent?.(node)}
            >
              ⇄
            </IconBtn>
            {canDelete && (
              <IconBtn
                title="삭제"
                onClick={() => onDelete?.(node)}
                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              >
                ✕
              </IconBtn>
            )}
          </div>
        )}
      </div>
      <div className="relative" style={{ width: totalWidth }}>
        {bar && (
          <button
            type="button"
            onMouseDown={(e) => {
              if (canEdit && !isGroup && !isEmptyRow && e.button === 0) {
                onBarDragStart?.(node, 'move', e);
              }
            }}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => {
              if (isEmptyRow) {
                if (canCreate) onAddRoot?.();
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
              selectionMode
                ? 'opacity-40 pointer-events-none'
                : canEdit && !isGroup && !isEmptyRow
                ? 'cursor-move'
                : ''
            } ${
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
            {canEdit && !isGroup && !isEmptyRow && (
              <>
                <span
                  role="presentation"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onBarDragStart?.(node, 'resize-start', e);
                  }}
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                />
                <span
                  role="presentation"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onBarDragStart?.(node, 'resize-end', e);
                  }}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                />
              </>
            )}
          </button>
        )}
        {previewBar && (
          <div
            className={`pointer-events-none absolute top-1 bottom-1 rounded border-2 border-dashed opacity-70 ${
              isGroup
                ? 'border-violet-400 bg-violet-300/40 dark:border-violet-500 dark:bg-violet-700/30'
                : 'border-sky-500 bg-sky-300/40 dark:border-sky-500 dark:bg-sky-700/30'
            }`}
            style={{ left: previewBar.leftPx, width: previewBar.widthPx }}
          />
        )}
      </div>
    </div>
  );
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
