import { describe, expect, it } from 'vitest';
import { buildRemapPlan } from '@sam/shared';
import { buildClonedNodes, type SourceNode } from './clone-tree';

/** 테스트에서 결정적 ID 를 쓰기 위한 카운터 팩토리. */
function counterIds(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

/**
 * depth 5 단계 트리.
 *   g0 (GROUP, depth 0)
 *     ├ g1 (GROUP, depth 1)
 *     │   └ g2 (GROUP, depth 2)
 *     │       └ g3 (GROUP, depth 3)
 *     │           └ i4 (ITEM, depth 4)
 *     └ i1 (ITEM, depth 1)
 * 일부러 depth 역순으로 넣어 정렬이 동작하는지 본다.
 */
function sampleTree(): SourceNode[] {
  return [
    { id: 'i4', parentId: 'g3', kind: 'ITEM', title: '말단 작업', description: null,
      startAt: '2026-03-01', endAt: '2026-03-15', sortOrder: 1, depth: 4 },
    { id: 'i1', parentId: 'g0', kind: 'ITEM', title: '1단 작업', description: '메모',
      startAt: '2026-01-01', endAt: '2026-01-31', sortOrder: 2, depth: 1 },
    { id: 'g3', parentId: 'g2', kind: 'GROUP', title: '3단 그룹', description: null,
      startAt: null, endAt: null, sortOrder: 1, depth: 3 },
    { id: 'g0', parentId: null, kind: 'GROUP', title: '루트', description: null,
      startAt: null, endAt: null, sortOrder: 1, depth: 0 },
    { id: 'g2', parentId: 'g1', kind: 'GROUP', title: '2단 그룹', description: null,
      startAt: null, endAt: null, sortOrder: 1, depth: 2 },
    { id: 'g1', parentId: 'g0', kind: 'GROUP', title: '1단 그룹', description: null,
      startAt: null, endAt: null, sortOrder: 1, depth: 1 },
  ];
}

const keepPlan = buildRemapPlan(null, { mode: 'KEEP' });

function cloneSample(plan = keepPlan) {
  return buildClonedNodes({
    sourceNodes: sampleTree(),
    newProjectId: 'proj-new',
    actorId: 'actor-1',
    plan,
    newId: counterIds(),
  });
}

describe('buildClonedNodes — 트리 재구성', () => {
  it('노드 개수가 유지된다', () => {
    expect(cloneSample()).toHaveLength(6);
  });

  it('depth 오름차순으로 반환한다 (부모가 항상 먼저 온다)', () => {
    const depths = cloneSample().map((n) => n.depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
  });

  it('반환 순서상 모든 부모가 자기보다 먼저 등장한다', () => {
    const out = cloneSample();
    const seen = new Set<string>();
    for (const n of out) {
      if (n.parentId !== null) expect(seen.has(n.parentId)).toBe(true);
      seen.add(n.id);
    }
  });

  it('parentId 가 전부 새 ID 로 다시 엮인다', () => {
    const out = cloneSample();
    const byTitle = new Map(out.map((n) => [n.title, n]));
    const root = byTitle.get('루트')!;
    const g1 = byTitle.get('1단 그룹')!;
    const g2 = byTitle.get('2단 그룹')!;
    const g3 = byTitle.get('3단 그룹')!;
    const i4 = byTitle.get('말단 작업')!;
    const i1 = byTitle.get('1단 작업')!;

    expect(root.parentId).toBeNull();
    expect(g1.parentId).toBe(root.id);
    expect(g2.parentId).toBe(g1.id);
    expect(g3.parentId).toBe(g2.id);
    expect(i4.parentId).toBe(g3.id);
    expect(i1.parentId).toBe(root.id);
  });

  it('원본 ID 가 새 노드에 남아 있지 않다', () => {
    const out = cloneSample();
    const oldIds = new Set(['g0', 'g1', 'g2', 'g3', 'i1', 'i4']);
    for (const n of out) {
      expect(oldIds.has(n.id)).toBe(false);
      if (n.parentId !== null) expect(oldIds.has(n.parentId)).toBe(false);
    }
  });

  it('sourceNodeId 로 원본을 되짚을 수 있다', () => {
    const out = cloneSample();
    expect(out.map((n) => n.sourceNodeId).sort()).toEqual(
      ['g0', 'g1', 'g2', 'g3', 'i1', 'i4'].sort(),
    );
  });

  it('projectId 와 작성자가 전부 새 값으로 채워진다', () => {
    for (const n of cloneSample()) {
      expect(n.projectId).toBe('proj-new');
      expect(n.createdById).toBe('actor-1');
      expect(n.updatedById).toBe('actor-1');
    }
  });

  it('progress 는 전부 0 이다', () => {
    for (const n of cloneSample()) expect(n.progress).toBe(0);
  });

  it('title / description / kind / sortOrder / depth 는 원본과 같다', () => {
    const out = cloneSample();
    const i1 = out.find((n) => n.sourceNodeId === 'i1')!;
    expect(i1.title).toBe('1단 작업');
    expect(i1.description).toBe('메모');
    expect(i1.kind).toBe('ITEM');
    expect(i1.sortOrder).toBe(2);
    expect(i1.depth).toBe(1);
  });

  it('빈 트리는 빈 배열을 낸다', () => {
    expect(
      buildClonedNodes({
        sourceNodes: [],
        newProjectId: 'p',
        actorId: 'a',
        plan: keepPlan,
        newId: counterIds(),
      }),
    ).toEqual([]);
  });
});

describe('buildClonedNodes — 날짜 처리', () => {
  it('ITEM 의 날짜만 재매핑한다', () => {
    // 원본 span 은 2026-01-01 ~ 2026-03-15. 2 달 뒤로 민다.
    const plan = buildRemapPlan(
      { start: '2026-01-01', end: '2026-03-15' },
      { mode: 'SHIFT', newStartDate: '2026-03-01' },
    );
    const out = cloneSample(plan);
    const i1 = out.find((n) => n.sourceNodeId === 'i1')!;
    const i4 = out.find((n) => n.sourceNodeId === 'i4')!;

    // 2026-01-01 → 2026-03-01 은 59 일
    expect(i1.startAt).toBe('2026-03-01');
    expect(i1.endAt).toBe('2026-03-31');
    expect(i4.startAt).toBe('2026-04-29');
    expect(i4.endAt).toBe('2026-05-13');
  });

  it('GROUP 의 날짜는 건드리지 않는다 (자손 ITEM 에서 자동 계산되므로)', () => {
    const plan = buildRemapPlan(
      { start: '2026-01-01', end: '2026-03-15' },
      { mode: 'SHIFT', newStartDate: '2026-03-01' },
    );
    for (const n of cloneSample(plan)) {
      if (n.kind === 'GROUP') {
        expect(n.startAt).toBeNull();
        expect(n.endAt).toBeNull();
      }
    }
  });

  it('KEEP 이면 ITEM 날짜도 그대로다', () => {
    const i1 = cloneSample().find((n) => n.sourceNodeId === 'i1')!;
    expect(i1.startAt).toBe('2026-01-01');
    expect(i1.endAt).toBe('2026-01-31');
  });
});

describe('buildClonedNodes — 에러 처리', () => {
  it('부모 ID 가 입력 배열에 없으면 Error 를 던진다', () => {
    const brokenTree: SourceNode[] = [
      { id: 'parent', parentId: null, kind: 'GROUP', title: 'Parent', description: null,
        startAt: null, endAt: null, sortOrder: 1, depth: 0 },
      { id: 'child', parentId: 'missing-parent', kind: 'ITEM', title: 'Child', description: null,
        startAt: '2026-01-01', endAt: '2026-01-31', sortOrder: 1, depth: 1 },
    ];
    expect(() =>
      buildClonedNodes({
        sourceNodes: brokenTree,
        newProjectId: 'proj',
        actorId: 'actor',
        plan: keepPlan,
        newId: counterIds(),
      }),
    ).toThrow(/refers to missing parent/);
  });
});
