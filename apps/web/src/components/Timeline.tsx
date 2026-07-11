import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeTreeItem, NodeHistoryItem } from '@sam/shared';
import { buildTree } from './NodeTree';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';

export type TimelineUnit = 'day' | 'week' | 'month' | 'quarter';

interface Props {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  selectedId: string | null;
  onSelect: (id: string) => void;
  jumpToTodayCounter: number; // 변경 시 "오늘로 이동" 트리거
}

const PPD: Record<TimelineUnit, number> = {
  day: 24,
  week: 10,
  month: 4,
  quarter: 2,
};

const ROW_HEIGHT = 32;
const LABEL_WIDTH = 280;
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

function flattenTree(items: NodeTreeItem[]): NodeTreeItem[] {
  const tree = buildTree(items);
  const out: NodeTreeItem[] = [];
  function walk(arr: typeof tree) {
    for (const n of arr) {
      out.push(n);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(tree);
  return out;
}

export default function Timeline({
  items,
  unit,
  selectedId,
  onSelect,
  jumpToTodayCounter,
}: Props) {
  const flat = useMemo(() => flattenTree(items), [items]);

  const range = useMemo(() => computeRange(items), [items]);

  const ppd = PPD[unit];
  const totalDays = range ? dayDiff(range.end, range.start) + 1 : 0;
  const totalWidth = Math.max(totalDays * ppd, 240);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const [hoveredNode, setHoveredNode] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!scrollerRef.current || !range) return;
    const today = todayUtc();
    const offsetDays = dayDiff(today, range.start);
    if (offsetDays < 0 || offsetDays > totalDays) return;
    const target = offsetDays * ppd - scrollerRef.current.clientWidth / 2 + LABEL_WIDTH / 2;
    scrollerRef.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [jumpToTodayCounter, range, ppd, totalDays]);

  if (!range) {
    return (
      <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        일자가 입력된 노드가 없어 Timeline 을 그릴 수 없습니다.
      </div>
    );
  }

  const headerCells = computeHeaderCells(range, unit, ppd);
  const today = todayUtc();
  const todayOffset = dayDiff(today, range.start);
  const todayInRange = todayOffset >= 0 && todayOffset <= totalDays;

  return (
    <div
      ref={scrollerRef}
      className="overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 max-h-[500px] lg:max-h-[calc(100vh-220px)]"
    >
      <div
        className="relative"
        style={{ width: LABEL_WIDTH + totalWidth }}
      >
        {/* Sticky 상단 헤더 (label corner + 일자 헤더) */}
        <div
          className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            style={{ width: LABEL_WIDTH }}
          >
            노드
          </div>
          <div className="relative" style={{ width: totalWidth }}>
            {headerCells.map((c, i) => (
              <div
                key={i}
                className="absolute top-0 flex h-full items-center border-l border-slate-200 px-1.5 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-400"
                style={{ left: c.offsetPx, width: c.widthPx }}
                title={c.label}
              >
                <span className="truncate">{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 행 영역 */}
        <div className="relative">
          {flat.map((n) => (
            <Row
              key={n.id}
              node={n}
              range={range}
              ppd={ppd}
              totalWidth={totalWidth}
              isSelected={selectedId === n.id}
              onSelect={onSelect}
              onHoverNode={setHoveredNode}
            />
          ))}
          {todayInRange && (
            <div
              ref={todayRef}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500/70"
              style={{ left: LABEL_WIDTH + todayOffset * ppd }}
              aria-label="오늘"
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
  );
}

function Row({
  node,
  range,
  ppd,
  totalWidth,
  isSelected,
  onSelect,
  onHoverNode,
}: {
  node: NodeTreeItem;
  range: { start: Date; end: Date };
  ppd: number;
  totalWidth: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onHoverNode: (hover: { id: string; title: string; x: number; y: number } | null) => void;
}) {
  const isGroup = node.kind === 'GROUP';
  const start = isGroup ? node.startAtEffective : node.startAt;
  const end = isGroup ? node.endAtEffective : node.endAt;
  const progress = isGroup ? node.progressEffective : node.progress;

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
      className={`group flex border-b border-slate-100 dark:border-slate-800 ${
        isSelected ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 px-3 text-left text-xs dark:border-slate-700 ${
          isSelected
            ? 'bg-sky-50 dark:bg-sky-950'
            : 'bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800'
        }`}
        style={{ width: LABEL_WIDTH, paddingLeft: 12 + node.depth * 16 }}
        title={node.title}
      >
        <span
          className={`shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold ${
            isGroup
              ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
              : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300'
          }`}
        >
          {isGroup ? 'G' : 'I'}
        </span>
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {progress !== null && (
          <span className="shrink-0 font-mono text-[10px] text-slate-500">
            {progress}%
          </span>
        )}
      </button>
      <div className="relative" style={{ width: totalWidth }}>
        {bar && (
          <button
            type="button"
            onClick={() => onSelect(node.id)}
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

function computeRange(items: NodeTreeItem[]): { start: Date; end: Date } | null {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const n of items) {
    const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
    const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
    if (s && (minStart === null || s < minStart)) minStart = s;
    if (e && (maxEnd === null || e > maxEnd)) maxEnd = e;
  }
  if (!minStart || !maxEnd) return null;
  const start = parseYmd(minStart);
  const end = parseYmd(maxEnd);
  start.setUTCDate(start.getUTCDate() - PADDING_DAYS);
  end.setUTCDate(end.getUTCDate() + PADDING_DAYS);
  return { start, end };
}

interface HeaderCell {
  offsetPx: number;
  widthPx: number;
  label: string;
}

function computeHeaderCells(
  range: { start: Date; end: Date },
  unit: TimelineUnit,
  ppd: number,
): HeaderCell[] {
  const cells: HeaderCell[] = [];
  const totalDays = dayDiff(range.end, range.start) + 1;

  if (unit === 'day') {
    for (let i = 0; i < totalDays; i += 1) {
      const d = new Date(range.start.getTime() + i * 86400000);
      const day = d.getUTCDate();
      cells.push({
        offsetPx: i * ppd,
        widthPx: ppd,
        label: day === 1 ? `${d.getUTCMonth() + 1}/${day}` : `${day}`,
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
