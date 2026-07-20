import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeActiveRange,
  computeHeaderCells,
  barRect,
  flattenTree,
} from './ganttLayout';
import { parseYmd } from './ganttMath';

function node(
  partial: Partial<NodeTreeItem> & { id: string; kind: NodeTreeItem['kind'] },
): NodeTreeItem {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    description: null,
    startAt: null,
    endAt: null,
    startAtEffective: null,
    endAtEffective: null,
    progress: 0,
    progressEffective: null,
    sortOrder: 1,
    depth: 0,
    createdById: 'u1',
    updatedById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as NodeTreeItem;
}

describe('constants', () => {
  it('exposes fixed row/header sizes and per-unit pixels-per-day', () => {
    expect(ROW_HEIGHT).toBe(32);
    expect(HEADER_HEIGHT).toBe(44);
    expect(PPD).toEqual({ day: 36, week: 10, month: 4, quarter: 2 });
  });
});

describe('computeActiveRange', () => {
  it('returns null when no node has dates', () => {
    expect(computeActiveRange([node({ id: 'a', kind: 'ITEM' })])).toBeNull();
  });

  it('spans the min start to max end across items (no year padding)', () => {
    const items = [
      node({ id: 'a', kind: 'ITEM', startAt: '2026-03-10', endAt: '2026-03-20' }),
      node({ id: 'b', kind: 'ITEM', startAt: '2026-03-01', endAt: '2026-03-15' }),
    ];
    const r = computeActiveRange(items)!;
    expect(r.start).toEqual(parseYmd('2026-03-01'));
    expect(r.end).toEqual(parseYmd('2026-03-20'));
  });

  it('uses effective dates for GROUP nodes', () => {
    const items = [
      node({ id: 'g', kind: 'GROUP', startAtEffective: '2026-01-05', endAtEffective: '2026-02-05' }),
    ];
    const r = computeActiveRange(items)!;
    expect(r.start).toEqual(parseYmd('2026-01-05'));
    expect(r.end).toEqual(parseYmd('2026-02-05'));
  });
});

describe('barRect', () => {
  it('places a bar by day offset and inclusive span', () => {
    const rangeStart = parseYmd('2026-03-01');
    // 03-03 ~ 03-04 = offset 2 days, span 2 days
    expect(barRect('2026-03-03', '2026-03-04', rangeStart, 10)).toEqual({
      leftPx: 20,
      widthPx: 20,
    });
  });

  it('keeps a minimum width of 2px for same-day bars', () => {
    const rangeStart = parseYmd('2026-03-01');
    expect(barRect('2026-03-01', '2026-03-01', rangeStart, 1)).toEqual({
      leftPx: 0,
      widthPx: 2,
    });
  });
});

describe('computeHeaderCells (month unit)', () => {
  it('produces one cell per calendar month', () => {
    const range = { start: parseYmd('2026-01-01'), end: parseYmd('2026-03-31') };
    const cells = computeHeaderCells(range, 'month', PPD.month);
    expect(cells.map((c) => c.label)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('flattenTree', () => {
  const items = [
    node({ id: 'g1', kind: 'GROUP', depth: 0, sortOrder: 1 }),
    node({ id: 'c1', kind: 'ITEM', parentId: 'g1', depth: 1, sortOrder: 1 }),
  ];
  it('includes children when nothing is collapsed', () => {
    expect(flattenTree(items, new Set()).map((n) => n.id)).toEqual(['g1', 'c1']);
  });
  it('omits children of a collapsed group', () => {
    expect(flattenTree(items, new Set(['g1'])).map((n) => n.id)).toEqual(['g1']);
  });
});
