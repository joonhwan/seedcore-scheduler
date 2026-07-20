// 간트/타임라인 레이아웃 계산 공용 모듈.
// 화면용 Timeline 과 이미지 내보내기용 정적 뷰가 함께 쓴다.
import type { NodeTreeItem } from '@sam/shared';
import { buildTree, type TreeNode } from '../components/NodeTree';
import { parseYmd, dayDiff } from './ganttMath';

export type TimelineUnit = 'day' | 'week' | 'month' | 'quarter';

export const PPD: Record<TimelineUnit, number> = {
  day: 36,
  week: 10,
  month: 4,
  quarter: 2,
};

export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 44;

export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

export function flattenTree(items: NodeTreeItem[], collapsedIds: Set<string>): TreeNode[] {
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

// 노드 목록에서 최소 시작일/최대 종료일을 스캔한다(GROUP은 effective 날짜 사용).
// computeRange/computeActiveRange 공용 내부 헬퍼.
function scanDateBounds(items: NodeTreeItem[]): { minStart: string | null; maxEnd: string | null } {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const n of items) {
    const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
    const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
    if (s && (minStart === null || s < minStart)) minStart = s;
    if (e && (maxEnd === null || e > maxEnd)) maxEnd = e;
  }
  return { minStart, maxEnd };
}

export function computeRange(items: NodeTreeItem[]): { start: Date; end: Date } {
  const { minStart, maxEnd } = scanDateBounds(items);

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

// 실제 일정 범위(앞뒤 여유 없음). 일정이 하나도 없으면 null.
export function computeActiveRange(
  items: NodeTreeItem[],
): { start: Date; end: Date } | null {
  const { minStart, maxEnd } = scanDateBounds(items);
  if (!minStart || !maxEnd) return null;
  return { start: parseYmd(minStart), end: parseYmd(maxEnd) };
}

// 막대의 좌표/폭(px). offset = 시작일까지 일수, span = 시작/종료 포함 일수.
export function barRect(
  startYmd: string,
  endYmd: string,
  rangeStart: Date,
  ppd: number,
): { leftPx: number; widthPx: number } {
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  const offset = dayDiff(s, rangeStart);
  const span = dayDiff(e, s) + 1;
  return { leftPx: offset * ppd, widthPx: Math.max(span * ppd, 2) };
}

export interface HeaderCell {
  offsetPx: number;
  widthPx: number;
  label: string;
  subLabel?: string | undefined;
  tooltip?: string | undefined;
  isSaturday?: boolean | undefined;
  isSunday?: boolean | undefined;
}

export function computeHeaderCells(
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
