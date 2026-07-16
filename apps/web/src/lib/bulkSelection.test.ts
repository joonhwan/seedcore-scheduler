import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import {
  collectDeleteTargets,
  collectCompleteTargets,
  hasGroupSelected,
  collectSubtreeIds,
  computeCheckStates,
} from './bulkSelection';

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

// g1 > (g2 > i1, i2), i3
const TREE = [
  node({ id: 'g1', kind: 'GROUP', depth: 0 }),
  node({ id: 'g2', kind: 'GROUP', parentId: 'g1', depth: 1 }),
  node({ id: 'i1', kind: 'ITEM', parentId: 'g2', depth: 2, progress: 0 }),
  node({ id: 'i2', kind: 'ITEM', parentId: 'g2', depth: 2, progress: 50 }),
  node({ id: 'i3', kind: 'ITEM', parentId: 'g1', depth: 1, progress: 10 }),
];

describe('collectDeleteTargets', () => {
  it('keeps only top-most selected nodes (drops nodes whose ancestor is also selected)', () => {
    const sel = new Set(['g2', 'i1', 'i3']); // g2 선택 → i1 은 자손이므로 제외
    const targets = collectDeleteTargets(sel, TREE).sort();
    expect(targets).toEqual(['g2', 'i3']);
  });

  it('keeps siblings that have no selected ancestor', () => {
    const sel = new Set(['i1', 'i2']);
    expect(collectDeleteTargets(sel, TREE).sort()).toEqual(['i1', 'i2']);
  });

  it('drops deep descendant when a higher ancestor is selected', () => {
    const sel = new Set(['g1', 'i1', 'i3']); // g1 이 최상위 → 나머지 전부 제외
    expect(collectDeleteTargets(sel, TREE)).toEqual(['g1']);
  });
});

describe('collectCompleteTargets', () => {
  it('items-only mode returns only selected ITEM ids (ignores GROUPs)', () => {
    const sel = new Set(['g2', 'i3']);
    expect(collectCompleteTargets(sel, TREE, 'items-only')).toEqual(['i3']);
  });

  it('include-descendants mode expands selected GROUPs to their descendant ITEMs', () => {
    const sel = new Set(['g2', 'i3']);
    expect(collectCompleteTargets(sel, TREE, 'include-descendants').sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('does not duplicate an ITEM selected both directly and via its GROUP', () => {
    const sel = new Set(['g2', 'i1']);
    expect(collectCompleteTargets(sel, TREE, 'include-descendants').sort()).toEqual(['i1', 'i2']);
  });

  it('empty GROUP contributes no items', () => {
    const items = [node({ id: 'g', kind: 'GROUP' })];
    expect(collectCompleteTargets(new Set(['g']), items, 'include-descendants')).toEqual([]);
  });
});

describe('hasGroupSelected', () => {
  it('is true when any selected node is a GROUP', () => {
    expect(hasGroupSelected(new Set(['i3', 'g2']), TREE)).toBe(true);
  });
  it('is false when all selected nodes are ITEMs', () => {
    expect(hasGroupSelected(new Set(['i1', 'i3']), TREE)).toBe(false);
  });
});

describe('collectSubtreeIds', () => {
  it('returns the node itself and all descendants', () => {
    expect(collectSubtreeIds('g1', TREE).sort()).toEqual(['g1', 'g2', 'i1', 'i2', 'i3']);
    expect(collectSubtreeIds('g2', TREE).sort()).toEqual(['g2', 'i1', 'i2']);
    expect(collectSubtreeIds('i1', TREE)).toEqual(['i1']);
  });
});

describe('computeCheckStates', () => {
  it('marks selected ITEMs checked and others unchecked', () => {
    const s = computeCheckStates(TREE, new Set(['i1']));
    expect(s.get('i1')).toBe('checked');
    expect(s.get('i2')).toBe('unchecked');
    expect(s.get('i3')).toBe('unchecked');
  });

  it('marks a GROUP indeterminate when only some descendants are selected (group itself not selected)', () => {
    const s = computeCheckStates(TREE, new Set(['i1']));
    expect(s.get('g2')).toBe('indeterminate');
    expect(s.get('g1')).toBe('indeterminate');
  });

  it('keeps a GROUP indeterminate even when ALL its children are individually selected', () => {
    const s = computeCheckStates(TREE, new Set(['i1', 'i2']));
    expect(s.get('g2')).toBe('indeterminate');
  });

  it('marks a GROUP checked when the group itself is selected', () => {
    const s = computeCheckStates(TREE, new Set(['g2', 'i1', 'i2']));
    expect(s.get('g2')).toBe('checked');
    expect(s.get('g1')).toBe('indeterminate'); // g1 self 미선택
  });

  it('marks everything unchecked for an empty selection', () => {
    const s = computeCheckStates(TREE, new Set());
    expect(s.get('g1')).toBe('unchecked');
    expect(s.get('g2')).toBe('unchecked');
    expect(s.get('i1')).toBe('unchecked');
  });
});
