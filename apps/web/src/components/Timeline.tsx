import { useEffect, useMemo, useRef } from 'react';
import type { NodeTreeItem } from '@sam/shared';
import { buildTree } from './NodeTree';

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
      className="overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
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
}: {
  node: NodeTreeItem;
  range: { start: Date; end: Date };
  ppd: number;
  totalWidth: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
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
      className={`flex border-b border-slate-100 dark:border-slate-800 ${
        isSelected ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 bg-inherit px-3 text-left text-xs dark:border-slate-700"
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
