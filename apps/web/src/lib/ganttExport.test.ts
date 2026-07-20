import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import {
  treeMaxDepth,
  depthStepCount,
  collapsedIdsForDepth,
  computeExportSize,
  sanitizeFilename,
  buildExportFilename,
  EXPORT_MAX_EDGE,
} from './ganttExport';

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

// g1(0) > g2(1) > i1(2), i2(2) ; i3(1)
const TREE: NodeTreeItem[] = [
  node({ id: 'g1', kind: 'GROUP', depth: 0, sortOrder: 1, startAtEffective: '2026-01-01', endAtEffective: '2026-12-31' }),
  node({ id: 'g2', kind: 'GROUP', parentId: 'g1', depth: 1, sortOrder: 1, startAtEffective: '2026-02-01', endAtEffective: '2026-03-01' }),
  node({ id: 'i1', kind: 'ITEM', parentId: 'g2', depth: 2, sortOrder: 1, startAt: '2026-02-01', endAt: '2026-02-10' }),
  node({ id: 'i2', kind: 'ITEM', parentId: 'g2', depth: 2, sortOrder: 2, startAt: '2026-02-11', endAt: '2026-03-01' }),
  node({ id: 'i3', kind: 'ITEM', parentId: 'g1', depth: 1, sortOrder: 2, startAt: '2026-06-01', endAt: '2026-12-31' }),
];

describe('treeMaxDepth / depthStepCount', () => {
  it('reports deepest node depth and its step count', () => {
    expect(treeMaxDepth(TREE)).toBe(2);
    expect(depthStepCount(TREE)).toBe(3); // 1,2,3 단계
  });
  it('handles an empty tree', () => {
    expect(treeMaxDepth([])).toBe(-1);
    expect(depthStepCount([])).toBe(0);
  });
});

describe('collapsedIdsForDepth', () => {
  it('collapses nothing for "all"', () => {
    expect(collapsedIdsForDepth(TREE, 'all').size).toBe(0);
  });
  it('K=1 keeps only depth 0 visible (collapses GROUPs at depth >= 0)', () => {
    // depth>=0 인 GROUP = g1, g2 → 접힘. 결과 표시행: g1 만.
    const ids = collapsedIdsForDepth(TREE, 1);
    expect(ids.has('g1')).toBe(true);
    expect(ids.has('g2')).toBe(true);
  });
  it('K=2 collapses GROUPs at depth >= 1 (g2), keeps depth 0..1', () => {
    const ids = collapsedIdsForDepth(TREE, 2);
    expect(ids.has('g1')).toBe(false);
    expect(ids.has('g2')).toBe(true);
  });
  it('never collapses ITEM nodes', () => {
    const ids = collapsedIdsForDepth(TREE, 1);
    expect(ids.has('i1')).toBe(false);
    expect(ids.has('i3')).toBe(false);
  });
});

describe('computeExportSize', () => {
  it('marks hasContent false when no dates exist', () => {
    const items = [node({ id: 'a', kind: 'ITEM' })];
    const s = computeExportSize({
      items,
      collapsedIds: new Set(),
      unit: 'month',
      labelWidth: 280,
      pixelRatio: 2,
      maxEdge: EXPORT_MAX_EDGE,
    });
    expect(s.hasContent).toBe(false);
  });

  it('computes width from days*ppd and height from visible rows', () => {
    // 2026-01-01 ~ 2026-12-31 = 365일, month ppd=4 → chart 1460, label 280 → total 1740
    // 표시행: all → g1,g2,i1,i2,i3 = 5행 → height 44 + 5*32 = 204
    const s = computeExportSize({
      items: TREE,
      collapsedIds: new Set(),
      unit: 'month',
      labelWidth: 280,
      pixelRatio: 2,
      maxEdge: EXPORT_MAX_EDGE,
    });
    expect(s.rowCount).toBe(5);
    expect(s.chartWidth).toBe(1460);
    expect(s.totalWidth).toBe(1740);
    expect(s.totalHeight).toBe(204);
    expect(s.scaledWidth).toBe(3480);
    expect(s.scaledHeight).toBe(408);
    expect(s.exceedsLimit).toBe(false);
  });

  it('flags exceedsLimit when a scaled edge passes maxEdge', () => {
    // day ppd=36, 365일 → chart 13140, +label 280 = 13420, ×2 = 26840 > 16000
    const s = computeExportSize({
      items: TREE,
      collapsedIds: new Set(),
      unit: 'day',
      labelWidth: 280,
      pixelRatio: 2,
      maxEdge: EXPORT_MAX_EDGE,
    });
    expect(s.exceedsLimit).toBe(true);
  });

  it('shrinks height when a depth limit collapses rows', () => {
    // K=2 → g2 접힘 → 표시행: g1, g2, i3 = 3행
    const s = computeExportSize({
      items: TREE,
      collapsedIds: collapsedIdsForDepth(TREE, 2),
      unit: 'month',
      labelWidth: 280,
      pixelRatio: 2,
      maxEdge: EXPORT_MAX_EDGE,
    });
    expect(s.rowCount).toBe(3);
    expect(s.totalHeight).toBe(44 + 3 * 32);
  });
});

describe('sanitizeFilename / buildExportFilename', () => {
  it('replaces path-unsafe characters with underscore', () => {
    expect(sanitizeFilename('a/b:c*?"<>|d')).toBe('a_b_c______d');
  });
  it('builds "{name}_간트_{date}.png"', () => {
    expect(buildExportFilename('신규 프로젝트', '2026-07-20')).toBe(
      '신규 프로젝트_간트_2026-07-20.png',
    );
  });
  it('falls back to a default name when project name is blank', () => {
    expect(buildExportFilename('   ', '2026-07-20')).toBe('간트_2026-07-20.png');
  });
});
