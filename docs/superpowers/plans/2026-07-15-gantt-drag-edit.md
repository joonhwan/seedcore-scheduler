# 간트 막대 드래그 편집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 간트 차트에서 ITEM 막대의 양 끝(리사이즈)과 본체(전체 이동)를 마우스로 드래그해 일정을 조정하고, 드래그 중 부모/조상 그룹 막대를 실시간 미리보기로 반영하며, 확인 창(Enter 적용 / ESC 취소)을 거쳐 저장한다.

**Architecture:** 순수 계산 로직(픽셀↔날짜, 리사이즈/이동 clamp, effective 재집계, 그룹 변경 diff)을 `apps/web/src/lib`의 테스트 가능한 순수 모듈로 분리한다. `Timeline`은 드래그 상호작용과 미리보기를 담당하고 확정 시 "변경 제안"을 `onBarChange`로 올린다. `ProjectDetailPage`가 확인 모달·저장(`useUpdateNode`)·스플래시·오류를 맡는다. 미리보기는 `previewProposal` prop을 부모→자식으로 내려 단방향으로 유지한다.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, TanStack Query 5, Tailwind. 테스트는 신규 도입하는 vitest 2.

## Global Constraints

- 백엔드·`packages/shared`·Prisma 스키마·마이그레이션은 **변경하지 않는다**. 기존 `UpdateNodeDto`와 PATCH `/nodes/:id`만 사용한다.
- 노드 수정 요청 body에는 항상 `expectedUpdatedAt: node.updatedAt`을 포함한다(낙관적 동시성).
- 날짜 문자열 형식은 `YYYY-MM-DD`이며 UTC 자정 기준으로 파싱한다.
- 저장 대상 값은 `startAt ≤ endAt`을 만족해야 한다(서버가 400을 반환하지 않도록 클라이언트에서 보장).
- 드래그 편집은 `kind === 'ITEM'` 노드에만, 그리고 `canEdit === true`일 때만 허용한다. GROUP 막대와 `empty-row-placeholder` 행은 제외한다.
- 셸에서 `cd`를 독립 실행하지 않는다. 워크스페이스 명령은 루트에서 `pnpm -F <pkg> ...`로 실행한다.
- 코드 수정 후 `pnpm -r typecheck`로 컴파일 오류가 없는지 확인한다.
- 기존 인라인 주석·설계 설명은 기능과 무관하면 보존한다.
- **커밋은 사용자 지시에 따라 최종에 한 번만 수행한다.** 각 Task는 typecheck/test 통과로 마무리하고, 개별 커밋을 만들지 않는다. Task 6에서 전체 검증 후 단일 커밋한다.

---

### Task 1: 순수 드래그 수학 모듈(`ganttMath`)과 vitest 도입

**Files:**
- Modify: `apps/web/package.json` (vitest devDependency + test 스크립트)
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/ganttMath.ts`
- Test: `apps/web/src/lib/ganttMath.test.ts`

**Interfaces:**
- Produces:
  - `type DragMode = 'resize-start' | 'resize-end' | 'move'`
  - `parseYmd(s: string): Date` — `"YYYY-MM-DD"` → UTC Date
  - `formatYmd(d: Date): string` — UTC Date → `"YYYY-MM-DD"`
  - `addDays(ymd: string, n: number): string`
  - `dayDiff(a: Date, b: Date): number` — `(a - b)`를 일수로
  - `pxToDays(dx: number, ppd: number): number` — `Math.round(dx / ppd)`
  - `resizeItem(startAt: string, endAt: string, edge: 'start' | 'end', deltaDays: number): { startAt: string; endAt: string }`
  - `moveItem(startAt: string, endAt: string, deltaDays: number): { startAt: string; endAt: string }`
  - `applyDrag(startAt: string, endAt: string, mode: DragMode, deltaDays: number): { startAt: string; endAt: string }`

- [ ] **Step 1: vitest devDependency와 test 스크립트 추가**

`apps/web/package.json`의 `scripts`에 `test`를 추가하고, `devDependencies`에 `vitest`를 추가한다.

```jsonc
// scripts 블록 — 기존 "typecheck": "tsc --noEmit" 아래에 한 줄 추가
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
```

```jsonc
// devDependencies 블록 — 알파벳 순서 유지, "vite-tsconfig-paths" 아래에 추가
    "vite-tsconfig-paths": "^5.0.1",
    "vitest": "^2.1.8"
```

그다음 워크스페이스 루트에서 설치한다.

Run: `pnpm -F @sam/web install`
Expected: vitest가 설치되고 lockfile이 갱신된다(폐쇄망이 아닌 개발 환경에서 수행).

- [ ] **Step 2: vitest 설정 파일 생성**

순수 함수만 테스트하므로 브라우저 환경(jsdom)이 필요 없다. Node 환경으로 둔다.

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: 실패하는 테스트 작성**

`apps/web/src/lib/ganttMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseYmd,
  formatYmd,
  addDays,
  dayDiff,
  pxToDays,
  resizeItem,
  moveItem,
  applyDrag,
} from './ganttMath';

describe('parseYmd / formatYmd', () => {
  it('round-trips a date string', () => {
    expect(formatYmd(parseYmd('2026-03-15'))).toBe('2026-03-15');
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-03-15', 3)).toBe('2026-03-18');
  });
  it('adds negative days', () => {
    expect(addDays('2026-03-15', -5)).toBe('2026-03-10');
  });
  it('crosses month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('dayDiff', () => {
  it('returns whole-day difference', () => {
    expect(dayDiff(parseYmd('2026-03-18'), parseYmd('2026-03-15'))).toBe(3);
  });
});

describe('pxToDays', () => {
  it('rounds pixel delta to nearest day', () => {
    expect(pxToDays(72, 36)).toBe(2);
    expect(pxToDays(50, 36)).toBe(1); // 1.39 -> 1
    expect(pxToDays(-72, 36)).toBe(-2);
    expect(pxToDays(10, 36)).toBe(0); // 0.28 -> 0
  });
});

describe('resizeItem', () => {
  it('moves the start edge', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'start', 3)).toEqual({
      startAt: '2026-03-18',
      endAt: '2026-03-20',
    });
  });
  it('clamps start to at most endAt (min 1 day)', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'start', 99)).toEqual({
      startAt: '2026-03-20',
      endAt: '2026-03-20',
    });
  });
  it('moves the end edge', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'end', -3)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-17',
    });
  });
  it('clamps end to at least startAt (min 1 day)', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'end', -99)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-15',
    });
  });
});

describe('moveItem', () => {
  it('shifts both edges preserving span', () => {
    expect(moveItem('2026-03-15', '2026-03-20', 5)).toEqual({
      startAt: '2026-03-20',
      endAt: '2026-03-25',
    });
  });
});

describe('applyDrag', () => {
  it('dispatches by mode', () => {
    expect(applyDrag('2026-03-15', '2026-03-20', 'move', 2)).toEqual({
      startAt: '2026-03-17',
      endAt: '2026-03-22',
    });
    expect(applyDrag('2026-03-15', '2026-03-20', 'resize-start', 2)).toEqual({
      startAt: '2026-03-17',
      endAt: '2026-03-20',
    });
    expect(applyDrag('2026-03-15', '2026-03-20', 'resize-end', 2)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-22',
    });
  });
});
```

- [ ] **Step 4: 테스트 실행해 실패 확인**

Run: `pnpm -F @sam/web test`
Expected: FAIL — `Failed to resolve import "./ganttMath"` (아직 구현 없음).

- [ ] **Step 5: `ganttMath.ts` 구현**

`apps/web/src/lib/ganttMath.ts`:

```ts
// 간트 드래그 편집용 순수 날짜/픽셀 계산 유틸.
// UTC 자정 기준 "YYYY-MM-DD" 문자열을 다룬다. 부수효과 없음(테스트 대상).

export type DragMode = 'resize-start' | 'resize-end' | 'move';

const MS_PER_DAY = 86400000;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(ymd: string, n: number): string {
  return formatYmd(new Date(parseYmd(ymd).getTime() + n * MS_PER_DAY));
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function pxToDays(dx: number, ppd: number): number {
  return Math.round(dx / ppd);
}

// startAt <= endAt 을 유지한다(최소 1일: startAt === endAt 까지 허용).
// 날짜 문자열은 "YYYY-MM-DD" 라 사전순 비교가 곧 시간순 비교다.
export function resizeItem(
  startAt: string,
  endAt: string,
  edge: 'start' | 'end',
  deltaDays: number,
): { startAt: string; endAt: string } {
  if (edge === 'start') {
    let ns = addDays(startAt, deltaDays);
    if (ns > endAt) ns = endAt;
    return { startAt: ns, endAt };
  }
  let ne = addDays(endAt, deltaDays);
  if (ne < startAt) ne = startAt;
  return { startAt, endAt: ne };
}

export function moveItem(
  startAt: string,
  endAt: string,
  deltaDays: number,
): { startAt: string; endAt: string } {
  return {
    startAt: addDays(startAt, deltaDays),
    endAt: addDays(endAt, deltaDays),
  };
}

export function applyDrag(
  startAt: string,
  endAt: string,
  mode: DragMode,
  deltaDays: number,
): { startAt: string; endAt: string } {
  if (mode === 'move') return moveItem(startAt, endAt, deltaDays);
  if (mode === 'resize-start') return resizeItem(startAt, endAt, 'start', deltaDays);
  return resizeItem(startAt, endAt, 'end', deltaDays);
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm -F @sam/web test`
Expected: PASS — 모든 케이스 통과.

- [ ] **Step 7: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음.

---

### Task 2: effective 재집계와 그룹 변경 diff 모듈(`ganttAggregate`, `ganttTypes`)

**Files:**
- Create: `apps/web/src/lib/ganttTypes.ts`
- Create: `apps/web/src/lib/ganttAggregate.ts`
- Test: `apps/web/src/lib/ganttAggregate.test.ts`

**Interfaces:**
- Consumes: `NodeTreeItem` 타입(`@sam/shared`).
- Produces (`ganttTypes.ts`):
  - `interface AffectedGroupChange { id: string; title: string; depth: number; beforeStart: string | null; beforeEnd: string | null; afterStart: string | null; afterEnd: string | null; }`
  - `interface BarChangeProposal { node: NodeTreeItem; newStartAt: string; newEndAt: string; affectedGroups: AffectedGroupChange[]; }`
- Produces (`ganttAggregate.ts`):
  - `recomputeEffective(items: NodeTreeItem[]): NodeTreeItem[]` — 각 노드의 `startAtEffective`/`endAtEffective`를 자식 ITEM들의 MIN/MAX로 다시 채운 새 배열 반환. `progressEffective` 등 나머지 필드는 보존.
  - `diffAffectedGroups(before: NodeTreeItem[], after: NodeTreeItem[]): AffectedGroupChange[]` — effective 범위가 바뀐 GROUP만 depth 내림차순(가까운 부모 먼저)으로 반환.

**참고:** 백엔드 `apps/api/src/nodes/tree-aggregation.ts` 44~125줄의 MIN/MAX 규칙을 프론트에서 재현한다. `buildTree`(`NodeTree.tsx`)를 쓰지 않고 `parentId` 기반으로 직접 순회해 순수 함수로 유지한다(루트는 `parentId === null`).

- [ ] **Step 1: 타입 파일 작성**

`apps/web/src/lib/ganttTypes.ts`:

```ts
import type { NodeTreeItem } from '@sam/shared';

// effective 범위가 드래그로 인해 바뀐 GROUP 하나의 변경 내역.
export interface AffectedGroupChange {
  id: string;
  title: string;
  depth: number;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
}

// 막대 드래그로 확정 대기 중인 변경 제안. Timeline -> ProjectDetailPage -> 확인 모달로 전달된다.
export interface BarChangeProposal {
  node: NodeTreeItem; // 드래그 대상 ITEM
  newStartAt: string; // "YYYY-MM-DD"
  newEndAt: string;
  affectedGroups: AffectedGroupChange[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/web/src/lib/ganttAggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { NodeTreeItem } from '@sam/shared';
import { recomputeEffective, diffAffectedGroups } from './ganttAggregate';

// 테스트용 노드 팩토리 — 필요한 필드만 채우고 나머지는 기본값.
function node(partial: Partial<NodeTreeItem> & { id: string; kind: NodeTreeItem['kind'] }): NodeTreeItem {
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
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `pnpm -F @sam/web test`
Expected: FAIL — `Failed to resolve import "./ganttAggregate"`.

- [ ] **Step 4: `ganttAggregate.ts` 구현**

`apps/web/src/lib/ganttAggregate.ts`:

```ts
import type { NodeTreeItem } from '@sam/shared';
import type { AffectedGroupChange } from './ganttTypes';

// 백엔드 tree-aggregation.ts 의 MIN/MAX 규칙을 프론트에서 재현한다.
// startAtEffective/endAtEffective 만 다시 계산하고 나머지 필드(progressEffective 등)는 보존한다.
// parentId === null 을 루트로 보고 자식맵을 만들어 재귀 집계한다.
export function recomputeEffective(items: NodeTreeItem[]): NodeTreeItem[] {
  const childrenMap = new Map<string | null, NodeTreeItem[]>();
  for (const n of items) {
    const arr = childrenMap.get(n.parentId) ?? [];
    arr.push(n);
    childrenMap.set(n.parentId, arr);
  }

  const startEff = new Map<string, string | null>();
  const endEff = new Map<string, string | null>();

  function visit(node: NodeTreeItem): { start: string | null; end: string | null } {
    if (node.kind === 'ITEM') {
      startEff.set(node.id, node.startAt);
      endEff.set(node.id, node.endAt);
      return { start: node.startAt, end: node.endAt };
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const child of childrenMap.get(node.id) ?? []) {
      const r = visit(child);
      if (r.start && (minStart === null || r.start < minStart)) minStart = r.start;
      if (r.end && (maxEnd === null || r.end > maxEnd)) maxEnd = r.end;
    }
    startEff.set(node.id, minStart);
    endEff.set(node.id, maxEnd);
    return { start: minStart, end: maxEnd };
  }

  for (const root of childrenMap.get(null) ?? []) visit(root);

  return items.map((n) => ({
    ...n,
    startAtEffective: startEff.get(n.id) ?? null,
    endAtEffective: endEff.get(n.id) ?? null,
  }));
}

// before/after 두 배열에서 effective 범위가 달라진 GROUP만 골라 반환한다.
// depth 내림차순(가까운 부모 먼저)으로 정렬한다.
export function diffAffectedGroups(
  before: NodeTreeItem[],
  after: NodeTreeItem[],
): AffectedGroupChange[] {
  const beforeMap = new Map(before.map((n) => [n.id, n]));
  const out: AffectedGroupChange[] = [];
  for (const a of after) {
    if (a.kind !== 'GROUP') continue;
    const b = beforeMap.get(a.id);
    if (!b) continue;
    if (b.startAtEffective !== a.startAtEffective || b.endAtEffective !== a.endAtEffective) {
      out.push({
        id: a.id,
        title: a.title,
        depth: a.depth,
        beforeStart: b.startAtEffective,
        beforeEnd: b.endAtEffective,
        afterStart: a.startAtEffective,
        afterEnd: a.endAtEffective,
      });
    }
  }
  out.sort((x, y) => y.depth - x.depth);
  return out;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm -F @sam/web test`
Expected: PASS — 모든 케이스 통과(ganttMath 포함).

- [ ] **Step 6: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음.

---

### Task 3: `Timeline`에 드래그·미리보기·커서 추가

**Files:**
- Modify: `apps/web/src/components/Timeline.tsx`

**Interfaces:**
- Consumes: `applyDrag`, `pxToDays`, `parseYmd`, `dayDiff`(`./ganttMath`); `recomputeEffective`, `diffAffectedGroups`(`../lib/ganttAggregate`); `BarChangeProposal`(`../lib/ganttTypes`).
- Produces (Props 추가):
  - `onBarChange?: ((proposal: BarChangeProposal) => void) | undefined`
  - `previewProposal?: BarChangeProposal | null | undefined`

이 Task는 순수 로직 단위 테스트가 아니라 typecheck + 브라우저 수동 검증으로 확인한다(자동 UI 테스트는 도입 범위 밖).

- [ ] **Step 1: import와 Props 타입 추가**

`Timeline.tsx` 1~6줄의 import 블록 아래에 순수 모듈 import를 추가한다. 그리고 파일 상단(38~50줄)에 이미 있는 `parseYmd`/`dayDiff` 로컬 정의를 **삭제하고** `ganttMath`에서 가져와 중복을 없앤다. `todayUtc`는 Timeline 전용이므로 그대로 둔다.

38~41줄의 로컬 `parseYmd`와 48~50줄의 로컬 `dayDiff`를 삭제하고, import를 다음과 같이 정리한다(2줄 근처):

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_TREE_DEPTH, type NodeTreeItem, type NodeHistoryItem } from '@sam/shared';
import { buildTree, maxDescendantDepth, type TreeNode } from './NodeTree';
import { FolderIcon, ItemIcon } from './Icons';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';
import { applyDrag, pxToDays, parseYmd, dayDiff, type DragMode } from '../lib/ganttMath';
import { recomputeEffective, diffAffectedGroups } from '../lib/ganttAggregate';
import type { BarChangeProposal } from '../lib/ganttTypes';
```

38~50줄 영역은 `todayUtc`만 남긴다:

```ts
function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}
```

`Props` 인터페이스(10~25줄)의 마지막 항목 뒤에 두 줄을 추가한다:

```ts
  onAddRoot?: (() => void) | undefined;
  onBarChange?: ((proposal: BarChangeProposal) => void) | undefined;
  previewProposal?: BarChangeProposal | null | undefined;
```

그리고 함수 구조분해(67~82줄)에도 두 이름을 추가한다:

```ts
  onAddRoot,
  onBarChange,
  previewProposal,
}: Props) {
```

- [ ] **Step 2: 드래그 상태와 미리보기 파생 데이터 추가**

`isDragging`/`dragStartRef` 선언(302~303줄) 아래에 막대 드래그 상태와 클릭 억제 ref를 추가한다:

```ts
  // 막대 드래그 편집 상태 (배경 패닝용 isDragging 과 별개)
  const [barDrag, setBarDrag] = useState<{
    nodeId: string;
    mode: DragMode;
    startClientX: number;
    deltaDays: number;
  } | null>(null);
  // move 드래그 직후 발생하는 click(선택)을 한 번 무시하기 위한 플래그
  const justDraggedRef = useRef(false);
```

`flat`을 계산하는 `useMemo`(120~144줄)는 그대로 두되, **미리보기가 반영된 items**를 별도로 파생시키고 이후 렌더가 이를 쓰도록 한다. `flat` useMemo 바로 위에 다음을 추가한다:

```ts
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
```

그다음 `flat` useMemo가 `items` 대신 `previewItems`를 쓰도록 바꾼다(120~144줄). 첫 줄과 deps만 교체한다:

```ts
  const flat = useMemo(() => {
    const list = flattenTree(previewItems, collapsedIds);
    // ...(emptyNode 정의는 그대로 유지)...
    return [...list, emptyNode];
  }, [previewItems, collapsedIds]);
```

**주의:** `range`(241줄)는 미리보기로 흔들리지 않도록 **원본 `items` 기준을 유지**한다(변경하지 않는다). 드래그로 막대가 좌우로 밀리는 효과만 보이고 시간축 전체가 재배치되지 않게 하기 위함이다.

`flat.map` 내부(682~688줄)에서 `buildTree(items)`를 호출해 형제를 찾는 부분도 미리보기 기준으로 통일한다:

```ts
            {flat.map((n) => {
              const tree = buildTree(previewItems);
```

- [ ] **Step 3: 막대 드래그 시작·진행·종료 로직 추가**

`barDrag` 상태 선언 아래에 드래그 시작 함수와 window 리스너 effect를 추가한다. 기존 배경 패닝 effect(372~392줄) 아래에 두면 된다.

```ts
  // 막대 위 mousedown 에서 호출 — 드래그 시작
  const startBarDrag = (node: NodeTreeItem, mode: DragMode, e: React.MouseEvent) => {
    if (!canEdit || node.kind !== 'ITEM' || !node.startAt || !node.endAt) return;
    e.stopPropagation(); // 배경 패닝/상위 전파 방지
    setBarDrag({ nodeId: node.id, mode, startClientX: e.clientX, deltaDays: 0 });
  };

  useEffect(() => {
    if (!barDrag) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - barDrag.startClientX;
      const dd = pxToDays(dx, ppd);
      setBarDrag((prev) => (prev && prev.deltaDays !== dd ? { ...prev, deltaDays: dd } : prev));
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
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // deltaDays 는 함수형 업데이트로 다루므로 deps 에서 제외해 리스너 재등록을 줄인다.
  }, [barDrag?.nodeId, barDrag?.startClientX, barDrag?.mode, ppd, items, onBarChange]);
```

- [ ] **Step 4: `onSelect`를 감싸 드래그 직후 클릭을 억제**

Row에 넘기는 선택 콜백을 래핑한다. `flat.map` 직전(682줄 근처)에 래퍼를 정의하고, Row의 `onSelect`에 넘긴다.

`return (` 이전, 컴포넌트 본문 하단(예: `headerCells` 계산부 486~489줄 아래)에 추가한다:

```ts
  const handleBarSelect = (id: string) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onSelect(id);
  };
```

`flat.map` 안의 `<Row ... onSelect={onSelect} ...>`(699줄)를 `onSelect={handleBarSelect}`로 바꾸고, 드래그 시작 콜백 prop을 함께 넘긴다:

```tsx
                  onSelect={handleBarSelect}
                  onBarDragStart={startBarDrag}
```

- [ ] **Step 5: `Row`에 드래그 핸들·커서·prop 추가**

`Row`의 props 타입(759~779줄)에 `onBarDragStart`를 추가한다:

```ts
  onDelete?: ((node: NodeTreeItem) => void) | undefined;
  onAddRoot?: (() => void) | undefined;
  onBarDragStart?: ((node: NodeTreeItem, mode: DragMode, e: React.MouseEvent) => void) | undefined;
}) {
```

`Row` 함수 구조분해(738~758줄)에도 `onBarDragStart`를 추가한다.

막대를 그리는 `<button>`(925~968줄)을 수정한다. 세 가지를 바꾼다.
1. ITEM이고 편집 가능하면 본체에 `onMouseDown`으로 move 드래그 시작 + `cursor-move`.
2. 양 끝 8px 핸들 div 2개를 얹어 리사이즈 시작(`cursor-ew-resize`).
3. 드래그 대상은 ITEM만이므로 GROUP/placeholder에는 핸들을 넣지 않는다.

기존 button을 다음으로 교체한다(기존 `onClick`/`onDoubleClick`/hover 핸들러와 `title`, 진행률 채움 div는 유지):

```tsx
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
                onAddRoot?.();
              } else {
                onEdit?.(node.id);
              }
            }}
            onMouseEnter={(e) => {
              onHoverNode({ id: node.id, title: node.title, x: e.clientX, y: e.clientY });
            }}
            onMouseMove={(e) => {
              onHoverNode({ id: node.id, title: node.title, x: e.clientX, y: e.clientY });
            }}
            onMouseLeave={() => {
              onHoverNode(null);
            }}
            className={`absolute top-1 bottom-1 overflow-hidden rounded ${
              canEdit && !isGroup && !isEmptyRow ? 'cursor-move' : ''
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
      </div>
```

**주의:** 진행률 채움 div는 `bar.widthPx` 전체를 덮지 않고 왼쪽에서 `progress%`만 채우므로, 핸들 `<span>`은 채움 div 뒤(DOM 상 나중)에 두어 오른쪽 핸들이 가려지지 않게 한다(위 코드 순서 유지).

- [ ] **Step 6: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음. (이 시점에는 `onBarChange`/`previewProposal`을 넘기는 쪽이 없어도 optional이라 통과한다.)

- [ ] **Step 7: 개발 서버에서 시각 확인(선택, 다음 Task와 함께 최종 검증)**

Task 5까지 연결되기 전에는 저장 흐름이 없다. 커서 표시(막대 위 `move`, 양 끝 `ew-resize`)와 드래그 시 막대/부모 그룹 막대가 함께 움직이는지만 육안으로 확인한다. 완전한 흐름 검증은 Task 6에서 수행한다.

---

### Task 4: 확인 모달 컴포넌트(`BarChangeConfirmDialog`)

**Files:**
- Create: `apps/web/src/components/BarChangeConfirmDialog.tsx`

**Interfaces:**
- Consumes: `BarChangeProposal`(`../lib/ganttTypes`).
- Produces:
  - `interface BarChangeConfirmDialogProps { proposal: BarChangeProposal; onConfirm: () => void; onCancel: () => void; }`
  - `export default function BarChangeConfirmDialog(props): JSX.Element`
- 동작: 대상 ITEM의 `기존 → 새` 일정과 영향받는 그룹 목록을 보여준다. Enter/ESC 키 처리는 이 컴포넌트가 자체 `useEffect`로 담당한다(Enter→`onConfirm`, ESC→`onCancel`).

- [ ] **Step 1: 컴포넌트 작성**

`apps/web/src/components/BarChangeConfirmDialog.tsx`:

```tsx
import { useEffect } from 'react';
import type { BarChangeProposal } from '../lib/ganttTypes';

interface BarChangeConfirmDialogProps {
  proposal: BarChangeProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

function fmt(v: string | null): string {
  return v ?? '—';
}

export default function BarChangeConfirmDialog({
  proposal,
  onConfirm,
  onCancel,
}: BarChangeConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  const { node, newStartAt, newEndAt, affectedGroups } = proposal;
  const beforeStart = node.startAt;
  const beforeEnd = node.endAt;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in-50 zoom-in-95 duration-100">
      <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          일정 변경 확인
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          드래그로 변경한 내용입니다. 적용하려면 Enter, 취소하려면 ESC 를 누르세요.
        </p>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={node.title}>
            {node.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-mono">
            <span className="text-rose-500 line-through">
              {fmt(beforeStart)} ~ {fmt(beforeEnd)}
            </span>
            <span className="text-slate-400">➔</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {newStartAt} ~ {newEndAt}
            </span>
          </div>
        </div>

        {affectedGroups.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              함께 조정되는 상위 그룹 ({affectedGroups.length})
            </div>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {affectedGroups.map((g) => (
                <li key={g.id} className="rounded bg-violet-50 px-2 py-1 text-[11px] dark:bg-violet-950/30">
                  <span className="font-medium text-violet-800 dark:text-violet-300 truncate" title={g.title}>
                    {g.title}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-rose-500 line-through">
                      {fmt(g.beforeStart)} ~ {fmt(g.beforeEnd)}
                    </span>
                    <span className="text-slate-400">➔</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {fmt(g.afterStart)} ~ {fmt(g.afterEnd)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            취소 (ESC)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
          >
            적용 (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음.

---

### Task 5: `ProjectDetailPage`에 저장 흐름 연결

**Files:**
- Modify: `apps/web/src/pages/ProjectDetailPage.tsx`

**Interfaces:**
- Consumes: `Timeline`의 `onBarChange`/`previewProposal`; `BarChangeConfirmDialog`; `useUpdateNode`(`../lib/nodes`); `BarChangeProposal`(`../lib/ganttTypes`); `isConflict`/`apiErrorMessage`(`../lib/errors`); `toast`.
- 동작: `onBarChange`로 받은 제안을 `pendingBarChange` state에 저장 → `Timeline`에 `previewProposal`로 되돌려 미리보기 유지 + `BarChangeConfirmDialog` 표시. 적용 시 `useUpdateNode`로 PATCH, 취소 시 state만 비운다. 저장 중 스플래시는 기존 `isMutating` 오버레이(440~452줄)가 자동으로 표시한다(`useUpdateNode`의 mutationKey `['nodes', id, 'update']`가 `useIsMutating({ mutationKey: ['nodes', id] })`에 잡힘).

- [ ] **Step 1: import와 상태 추가**

13~21줄 import에 `useUpdateNode`, 모달, 타입을 추가한다:

```ts
import { useNodes, useDeleteNode, useMoveNode, useUpdateNode } from '../lib/nodes';
import { apiErrorMessage, isConflict } from '../lib/errors';
import { toast } from '../lib/toast';
import NodeDetail from '../components/NodeDetail';
import NodeFormDialog from '../components/NodeFormDialog';
import ParentPickerDialog from '../components/ParentPickerDialog';
import CommentInputForm from '../components/CommentInputForm';
import ActivityFeedPanel from '../components/ActivityFeedPanel';
import Timeline, { type TimelineUnit } from '../components/Timeline';
import BarChangeConfirmDialog from '../components/BarChangeConfirmDialog';
import type { BarChangeProposal } from '../lib/ganttTypes';
```

mutation 훅과 상태를 추가한다. `moveNode` 선언(31줄) 아래:

```ts
  const moveNode = useMoveNode(id ?? '');
  const updateNode = useUpdateNode(id ?? '');
```

상태 선언부(48줄, `showConfirmClose` 아래)에 추가:

```ts
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [pendingBarChange, setPendingBarChange] = useState<BarChangeProposal | null>(null);
```

- [ ] **Step 2: 적용/취소 핸들러 추가**

`onDeleteNode` 함수(256~274줄) 아래에 막대 변경 적용/취소 핸들러를 추가한다:

```ts
  async function applyBarChange() {
    if (!pendingBarChange) return;
    const { node, newStartAt, newEndAt } = pendingBarChange;
    try {
      await updateNode.mutateAsync({
        id: node.id,
        body: {
          startAt: newStartAt,
          endAt: newEndAt,
          expectedUpdatedAt: node.updatedAt,
        },
      });
      // 성공: 트리 재조회는 useUpdateNode onSuccess 가 처리. 미리보기 해제.
      setPendingBarChange(null);
    } catch (err) {
      if (isConflict(err)) {
        toast.error(apiErrorMessage(err));
      } else {
        toast.error(apiErrorMessage(err));
      }
      // 실패: 미리보기를 원복(원본 데이터로).
      setPendingBarChange(null);
    }
  }

  function cancelBarChange() {
    setPendingBarChange(null);
  }
```

- [ ] **Step 3: `Timeline`에 콜백/미리보기 prop 연결**

`<Timeline ...>`(295~315줄)에 두 prop을 추가한다. `onAddRoot` 아래:

```tsx
              onAddRoot={() => setCreateParent('root')}
              onBarChange={setPendingBarChange}
              previewProposal={pendingBarChange}
```

- [ ] **Step 4: 확인 모달 렌더링**

`pendingBarChange`가 있을 때 모달을 띄운다. `{createParent !== null && ( ... )}` 블록(423~430줄) 위 또는 아래(같은 최상위 JSX 레벨)에 추가한다:

```tsx
      {pendingBarChange && (
        <BarChangeConfirmDialog
          proposal={pendingBarChange}
          onConfirm={applyBarChange}
          onCancel={cancelBarChange}
        />
      )}
```

**주의:** `BarChangeConfirmDialog`는 자체 Enter/ESC 리스너를 가진다. `ProjectDetailPage`의 기존 전역 keydown(120~142줄)은 `isDetailModalOpen` 조건에서만 동작하므로, 막대 확인 모달과 충돌하지 않는다(막대 드래그 중에는 상세 모달이 닫혀 있다).

- [ ] **Step 5: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음.

- [ ] **Step 6: 미사용 분기 정리**

Step 2의 `applyBarChange`에서 `isConflict` 분기가 양쪽 동일 동작이면 다음처럼 단순화한다(불필요한 분기 제거):

```ts
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setPendingBarChange(null); // 미리보기 원복
    }
```

`isConflict` import가 다른 곳에서 안 쓰이면 import에서 제거한다. (409도 `apiErrorMessage`가 CONFLICT 메시지를 반환하므로 별도 분기가 필요 없다.)

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없음(미사용 import 없음).

---

### Task 6: 통합 검증과 단일 커밋

**Files:** (검증만, 신규 변경 없음)

- [ ] **Step 1: 전체 타입 검사**

Run: `pnpm -r typecheck`
Expected: 모든 워크스페이스 오류 없음.

- [ ] **Step 2: 단위 테스트 전체 실행**

Run: `pnpm -F @sam/web test`
Expected: `ganttMath`·`ganttAggregate` 모든 케이스 PASS.

- [ ] **Step 3: 개발 서버 기동 후 브라우저 수동 검증**

AGENTS.md 3장 순서대로(shared 빌드 → prisma migrate → dev) 개발 서버를 띄운 뒤, Playwright MCP로 다음 시나리오를 확인한다. 편집 권한이 있는 계정으로 프로젝트 상세(`/projects/:id`)에 접속한다.

1. ITEM 막대 위에 마우스를 올리면 커서가 `move`, 양 끝 8px에서는 `ew-resize`, 차트 배경에서는 `grab`으로 바뀐다.
2. GROUP 막대에는 드래그 핸들이 없고 커서가 바뀌지 않는다.
3. ITEM 오른쪽 끝을 오른쪽으로 드래그하면 막대가 늘어나고, 부모/조상 그룹 막대도 함께 늘어난다(실시간 미리보기).
4. 마우스를 놓으면 확인 모달이 뜨고, 대상 ITEM의 `기존 → 새` 일정과 영향받는 그룹 목록이 보인다.
5. ESC를 누르면 모달이 닫히고 막대가 원위치로 돌아온다(원복).
6. 다시 드래그 후 Enter를 누르면 "일정을 처리 중입니다…" 스플래시가 잠깐 뜨고, 저장 후 트리가 갱신되어 새 일정이 반영된다.
7. 막대를 드래그하지 않고 한 번 클릭하면 선택만 되고 모달이 뜨지 않는다(드래그 직후 클릭 억제도 확인).
8. 읽기 전용 타임라인 페이지(`ProjectTimelinePage`)에서는 드래그 핸들이 없고 편집이 불가능하다.

Expected: 위 8가지 모두 기대대로 동작.

- [ ] **Step 4: 사용자에게 `master` 직접 커밋 여부 확인 후 단일 커밋**

현재 브랜치는 `master`(기본 브랜치)다. 커밋 전 사용자에게 `master`에 직접 커밋할지, 기능 브랜치를 만들지 확인한다. 확인 후 변경 전체를 한 번에 커밋한다.

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/vitest.config.ts \
  apps/web/src/lib/ganttMath.ts apps/web/src/lib/ganttMath.test.ts \
  apps/web/src/lib/ganttAggregate.ts apps/web/src/lib/ganttAggregate.test.ts \
  apps/web/src/lib/ganttTypes.ts \
  apps/web/src/components/BarChangeConfirmDialog.tsx \
  apps/web/src/components/Timeline.tsx \
  apps/web/src/pages/ProjectDetailPage.tsx \
  docs/superpowers/specs/2026-07-15-gantt-drag-edit-design.md \
  docs/superpowers/plans/2026-07-15-gantt-drag-edit.md
git commit -m "$(cat <<'EOF'
feat: 간트 막대 드래그로 ITEM 일정 편집 (리사이즈/이동 + 그룹 실시간 반영)

- ITEM 막대 양 끝 리사이즈, 본체 전체 이동을 마우스 드래그로 지원
- 드래그 중 부모/조상 그룹 막대 effective 실시간 미리보기
- 확인 모달(Enter 적용/ESC 취소) 후 PATCH /nodes/:id 저장, 스플래시 재사용
- 순수 계산 로직(ganttMath/ganttAggregate) 분리 및 vitest 단위 테스트 도입

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**주의:** lockfile 경로(`pnpm-lock.yaml`)는 워크스페이스 루트에 있을 수 있다. `git status`로 실제 변경 파일을 확인하고 add 대상을 조정한다.

---

## Self-Review

**1. Spec coverage** — 설계 문서 각 절 대응:
- §4 드래그 상호작용(리사이즈/이동, ITEM 한정, 1일 스냅, 최소 1일 clamp) → Task 1(계산) + Task 3(상호작용).
- §5 커서 구분(배경 grab / 리사이즈 ew-resize / 이동 move) → Task 3 Step 5.
- §6 실시간 미리보기(조상 그룹 재집계) → Task 2 `recomputeEffective` + Task 3 `previewItems`.
- §7 확인 모달(기존→새, 영향 그룹, Enter/ESC) → Task 4.
- §8 적용·스플래시·오류(409 포함) → Task 5(저장/오류) + 기존 스플래시 재사용.
- §9 변경 파일 → Task 1~5가 그대로 대응, 백엔드/스키마 변경 없음.
- §10 범위 밖(진행률 드래그, GROUP 직접 편집 등) → 계획에 포함하지 않음(준수).

**2. Placeholder scan** — "TBD/TODO/적절히 처리" 없음. 모든 코드 step에 실제 코드 포함.

**3. Type consistency** — `DragMode`(ganttMath) ↔ Timeline `barDrag.mode`/`onBarDragStart` 일치. `BarChangeProposal`(ganttTypes) ↔ Timeline `onBarChange`/`previewProposal` ↔ Dialog `proposal` ↔ Page `pendingBarChange` 일치. `AffectedGroupChange` 필드(`beforeStart/beforeEnd/afterStart/afterEnd/depth/title/id`) ↔ Dialog 렌더 일치. `recomputeEffective`/`diffAffectedGroups` 시그니처 ↔ 호출부 일치.
