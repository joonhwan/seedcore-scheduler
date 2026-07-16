import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import { recomputeEffective, diffAffectedGroups } from './ganttAggregate';

// 테스트용 노드 팩토리 — 필요한 필드만 채우고 나머지는 기본값.
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

describe('recomputeEffective', () => {
  it('sets an ITEM effective to its own dates', () => {
    const items = [node({ id: 'i1', kind: 'ITEM', startAt: '2026-03-10', endAt: '2026-03-12' })];
    const out = recomputeEffective(items);
    expect(out[0]!.startAtEffective).toBe('2026-03-10');
    expect(out[0]!.endAtEffective).toBe('2026-03-12');
  });

  it('aggregates a GROUP as MIN start / MAX end of children', () => {
    const items = [
      node({ id: 'g1', kind: 'GROUP', depth: 0 }),
      node({ id: 'i1', kind: 'ITEM', parentId: 'g1', depth: 1, startAt: '2026-03-10', endAt: '2026-03-12' }),
      node({ id: 'i2', kind: 'ITEM', parentId: 'g1', depth: 1, startAt: '2026-03-08', endAt: '2026-03-20' }),
    ];
    const out = recomputeEffective(items);
    const g1 = out.find((n) => n.id === 'g1')!;
    expect(g1.startAtEffective).toBe('2026-03-08');
    expect(g1.endAtEffective).toBe('2026-03-20');
  });

  it('propagates through nested GROUPs to the ancestor', () => {
    const items = [
      node({ id: 'g1', kind: 'GROUP', depth: 0 }),
      node({ id: 'g2', kind: 'GROUP', parentId: 'g1', depth: 1 }),
      node({ id: 'i1', kind: 'ITEM', parentId: 'g2', depth: 2, startAt: '2026-03-10', endAt: '2026-03-12' }),
    ];
    const out = recomputeEffective(items);
    expect(out.find((n) => n.id === 'g1')!.startAtEffective).toBe('2026-03-10');
    expect(out.find((n) => n.id === 'g1')!.endAtEffective).toBe('2026-03-12');
  });

  it('returns null effective for an empty GROUP', () => {
    const items = [node({ id: 'g1', kind: 'GROUP' })];
    const out = recomputeEffective(items);
    expect(out[0]!.startAtEffective).toBeNull();
    expect(out[0]!.endAtEffective).toBeNull();
  });

  it('preserves progressEffective', () => {
    const items = [
      node({ id: 'g1', kind: 'GROUP', progressEffective: 42 }),
      node({ id: 'i1', kind: 'ITEM', parentId: 'g1', startAt: '2026-03-10', endAt: '2026-03-12', progress: 42, progressEffective: 42 }),
    ];
    const out = recomputeEffective(items);
    expect(out.find((n) => n.id === 'g1')!.progressEffective).toBe(42);
  });
});

describe('diffAffectedGroups', () => {
  it('detects a parent GROUP whose range expanded, and skips unchanged ones', () => {
    const base = [
      node({ id: 'g1', kind: 'GROUP', depth: 0 }),
      node({ id: 'g2', kind: 'GROUP', parentId: 'g1', depth: 1 }),
      node({ id: 'i1', kind: 'ITEM', parentId: 'g2', depth: 2, startAt: '2026-03-10', endAt: '2026-03-12' }),
      node({ id: 'i2', kind: 'ITEM', parentId: 'g1', depth: 1, startAt: '2026-01-01', endAt: '2026-12-31' }),
    ];
    const before = recomputeEffective(base);
    // i1 종료일을 크게 늘려 g2 는 바뀌지만 g1 은 이미 i2 때문에 범위가 넓어 그대로.
    const mutated = base.map((n) => (n.id === 'i1' ? { ...n, endAt: '2026-03-25' } : n));
    const after = recomputeEffective(mutated);

    const changes = diffAffectedGroups(before, after);
    const ids = changes.map((c) => c.id);
    expect(ids).toContain('g2');
    expect(ids).not.toContain('g1');
    const g2 = changes.find((c) => c.id === 'g2')!;
    expect(g2.beforeEnd).toBe('2026-03-12');
    expect(g2.afterEnd).toBe('2026-03-25');
  });

  it('sorts changes by depth descending (closest parent first)', () => {
    const base = [
      node({ id: 'g1', kind: 'GROUP', depth: 0 }),
      node({ id: 'g2', kind: 'GROUP', parentId: 'g1', depth: 1 }),
      node({ id: 'i1', kind: 'ITEM', parentId: 'g2', depth: 2, startAt: '2026-03-10', endAt: '2026-03-12' }),
    ];
    const before = recomputeEffective(base);
    const mutated = base.map((n) => (n.id === 'i1' ? { ...n, startAt: '2026-02-01' } : n));
    const after = recomputeEffective(mutated);

    const changes = diffAffectedGroups(before, after);
    expect(changes.map((c) => c.id)).toEqual(['g2', 'g1']);
  });
});
