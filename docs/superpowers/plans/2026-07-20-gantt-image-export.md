# 간트차트 이미지 내보내기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타임라인(간트) 뷰에 "Export 드롭다운"을 추가해, 간트 차트를 선택한 눈금·깊이·테마로 PNG 이미지로 내보낸다.

**Architecture:** 화면 밖(off-screen)에 스크롤·상호작용이 없는 **정적 전용 간트 컴포넌트**를 잠깐 렌더하고 `html-to-image`로 캡처한다. 날짜·헤더·막대 픽셀 계산은 기존 `Timeline`에서 공용 모듈로 추출해 재사용하고, 펼침 깊이·크기 계산은 순수 함수로 분리해 단위 테스트한다. 기존 `Timeline`의 겉보기 동작은 바꾸지 않는다.

**Tech Stack:** React 18, Vite, Tailwind CSS, TypeScript, Vitest, `html-to-image`.

## Global Constraints

- **폐쇄망(air-gap)**: 외부 CDN·원격 리소스 금지. `html-to-image`는 `apps/web`의 `dependency`로 설치해 빌드 산출물에 포함한다.
- **셸**: `cd` 단독 실행 금지. 워크스페이스 명령은 루트에서 `pnpm -F @sam/web ...`로 실행한다.
- **타입 검사**: 코드 변경 후 `pnpm -F @sam/web typecheck`(또는 `pnpm -r typecheck`)로 확인한다.
- **`exactOptionalPropertyTypes: true`**: optional prop에 `undefined`를 명시로 넘기지 않도록 주의한다.
- **DB/스키마/백엔드 변경 없음**: 이 작업은 프론트엔드 표시·내보내기만 추가한다.
- **주석 보존**: 기존 인라인 주석·설계 설명을 기능과 무관하게 지우지 않는다.
- **트리 깊이**: `depth` 0~4, 최대 5단계(AGENTS.md 4.6).
- **커밋 trailer**: 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 를 붙인다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `apps/web/src/lib/ganttLayout.ts` (신규) | `Timeline`에서 추출한 공용 레이아웃 계산: 단위·상수·`computeRange`·`computeHeaderCells`·`flattenTree`·`todayUtc`, 신규 `computeActiveRange`·`barRect` |
| `apps/web/src/lib/ganttLayout.test.ts` (신규) | 위 순수 함수 테스트 |
| `apps/web/src/components/Timeline.tsx` (수정) | 위 정의를 로컬 삭제하고 `ganttLayout`에서 import |
| `apps/web/src/lib/ganttExport.ts` (신규) | 순수 export 로직: 펼침 깊이→`collapsedIds`, 트리 깊이, 크기 계산, 파일명, 상수·라벨 |
| `apps/web/src/lib/ganttExport.test.ts` (신규) | 위 순수 함수 테스트 |
| `apps/web/src/components/GanttExportView.tsx` (신규) | 정적 렌더 전용 간트(테마 prop 기반 인라인 색, 오늘선 없음, 상호작용 없음) |
| `apps/web/src/lib/exportGanttImage.ts` (신규) | 화면 밖 렌더 + `html-to-image` 캡처 + 다운로드(부수효과) |
| `apps/web/src/components/GanttExportDialog.tsx` (신규) | 설정 대화상자(눈금·깊이·테마·예상 크기·경고·내보내기) |
| `apps/web/src/components/ExportMenu.tsx` (신규) | 헤더의 Export 드롭다운 버튼 |
| `apps/web/src/pages/ProjectTimelinePage.tsx` (수정) | 드롭다운·대화상자 연결, 현재 테마 전달 |
| `apps/web/package.json` (수정) | `html-to-image` 의존성 추가 |

**작업 순서**: Task 1(레이아웃 추출) → Task 2(export 순수 로직) → Task 3(정적 뷰) → Task 4(캡처 실행) → Task 5(대화상자) → Task 6(드롭다운·연결).

---

## Task 1: 공용 간트 레이아웃 모듈 추출

기존 `Timeline.tsx` 안에만 있는 레이아웃 계산을 `ganttLayout.ts`로 옮겨 정적 뷰와 공유한다. **동작은 그대로다** — 옮긴 함수는 원본과 글자까지 동일하게 유지하고, 신규는 `computeActiveRange`·`barRect` 둘뿐이다.

**Files:**
- Create: `apps/web/src/lib/ganttLayout.ts`
- Test: `apps/web/src/lib/ganttLayout.test.ts`
- Modify: `apps/web/src/components/Timeline.tsx`

**Interfaces:**
- Consumes: `parseYmd`, `dayDiff` (기존 `apps/web/src/lib/ganttMath.ts`), `buildTree`, `TreeNode` (기존 `apps/web/src/components/NodeTree.tsx`), `NodeTreeItem` (`@sam/shared`).
- Produces:
  - `type TimelineUnit = 'day' | 'week' | 'month' | 'quarter'`
  - `const PPD: Record<TimelineUnit, number>` = `{ day:36, week:10, month:4, quarter:2 }`
  - `const ROW_HEIGHT = 32`, `const HEADER_HEIGHT = 44`
  - `function todayUtc(): Date`
  - `function flattenTree(items: NodeTreeItem[], collapsedIds: Set<string>): TreeNode[]`
  - `function computeRange(items: NodeTreeItem[]): { start: Date; end: Date }` (앞뒤 1년 여유 포함 — 기존 동작)
  - `function computeActiveRange(items: NodeTreeItem[]): { start: Date; end: Date } | null` (신규 — 여유 없이 실제 일정 최소~최대, 일정 없으면 null)
  - `interface HeaderCell { offsetPx; widthPx; label; subLabel?; tooltip?; isSaturday?; isSunday? }`
  - `function computeHeaderCells(range, unit: TimelineUnit, ppd: number): HeaderCell[]`
  - `function barRect(startYmd: string, endYmd: string, rangeStart: Date, ppd: number): { leftPx: number; widthPx: number }` (신규 — Row 인라인 계산과 동일 공식)

- [ ] **Step 1: 실패 테스트 작성**

Create `apps/web/src/lib/ganttLayout.test.ts`:

```typescript
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @sam/web test`
Expected: FAIL — `Cannot find module './ganttLayout'`

- [ ] **Step 3: `ganttLayout.ts` 작성**

Create `apps/web/src/lib/ganttLayout.ts`. `computeRange`/`computeHeaderCells`/`flattenTree`/`todayUtc`/상수는 `Timeline.tsx`(51~80줄, 1316~1445줄)에서 **그대로** 옮기고, `computeActiveRange`·`barRect`만 새로 추가한다:

```typescript
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

export function computeRange(items: NodeTreeItem[]): { start: Date; end: Date } {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const n of items) {
    const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
    const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
    if (s && (minStart === null || s < minStart)) minStart = s;
    if (e && (maxEnd === null || e > maxEnd)) maxEnd = e;
  }

  let start: Date;
  let end: Date;

  if (minStart && maxEnd) {
    start = parseYmd(minStart);
    end = parseYmd(maxEnd);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
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
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const n of items) {
    const s = n.kind === 'GROUP' ? n.startAtEffective : n.startAt;
    const e = n.kind === 'GROUP' ? n.endAtEffective : n.endAt;
    if (s && (minStart === null || s < minStart)) minStart = s;
    if (e && (maxEnd === null || e > maxEnd)) maxEnd = e;
  }
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/web test`
Expected: PASS (ganttLayout.test.ts 전부 통과)

- [ ] **Step 5: `Timeline.tsx`를 import로 전환**

`apps/web/src/components/Timeline.tsx`에서:
1. 상단 import에 추가:
   ```typescript
   import {
     PPD,
     ROW_HEIGHT,
     HEADER_HEIGHT,
     todayUtc,
     flattenTree,
     computeRange,
     computeHeaderCells,
     type TimelineUnit,
     type HeaderCell,
   } from '../lib/ganttLayout';
   ```
2. 기존 로컬 정의를 **삭제**한다: `export type TimelineUnit`(12줄) → `import`한 타입을 재노출하도록 아래 3번으로 대체. `PPD`(51~56줄), `ROW_HEIGHT`/`HEADER_HEIGHT`(58~59줄), `todayUtc`(62~65줄), `flattenTree`(67~80줄), `computeRange`(1316~1342줄), `interface HeaderCell`(1344~1352줄), `computeHeaderCells`(1354~1445줄)를 지운다. `PADDING_DAYS`(60줄)는 사용처가 없으면 함께 지운다.
3. `Timeline`은 `TimelineUnit`을 외부(페이지)로 재노출하므로, 파일에서 다음을 유지한다:
   ```typescript
   export type { TimelineUnit } from '../lib/ganttLayout';
   ```
   (기존 `export type TimelineUnit = ...` 선언은 삭제하고 이 재노출로 바꾼다. `ProjectTimelinePage`·`ProjectDetailPage`의 `import { type TimelineUnit } from '../components/Timeline'`가 그대로 동작한다.)

- [ ] **Step 6: 타입 검사 + 전체 테스트**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음
Run: `pnpm -F @sam/web test`
Expected: 기존 테스트 + ganttLayout.test.ts 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/lib/ganttLayout.ts apps/web/src/lib/ganttLayout.test.ts apps/web/src/components/Timeline.tsx
git commit -m "refactor(web): 간트 레이아웃 계산을 ganttLayout 공용 모듈로 추출

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: export 순수 로직 (`ganttExport.ts`)

펼침 깊이 → `collapsedIds`, 트리 최대 깊이, 예상 크기, 파일명 계산을 부수효과 없는 순수 함수로 만든다.

**Files:**
- Create: `apps/web/src/lib/ganttExport.ts`
- Test: `apps/web/src/lib/ganttExport.test.ts`

**Interfaces:**
- Consumes: `PPD`, `ROW_HEIGHT`, `HEADER_HEIGHT`, `computeActiveRange`, `flattenTree`, `type TimelineUnit` (`./ganttLayout`), `dayDiff` (`./ganttMath`), `NodeTreeItem` (`@sam/shared`).
- Produces:
  - `type DepthOption = 'all' | number` (number = 화면 표기 K단계)
  - `const UNIT_LABELS: Record<TimelineUnit, string>` = `{ day:'일', week:'주', month:'월', quarter:'분기' }`
  - `const EXPORT_MAX_EDGE = 16000`
  - `const EXPORT_PIXEL_RATIO = 2`
  - `const DEFAULT_LABEL_WIDTH = 280`
  - `function treeMaxDepth(items): number` (노드 없으면 -1)
  - `function depthStepCount(items): number` (`treeMaxDepth + 1`, 노드 없으면 0)
  - `function collapsedIdsForDepth(items, depth: DepthOption): Set<string>`
  - `interface ExportSize { hasContent; unit; labelWidth; chartWidth; totalWidth; totalHeight; scaledWidth; scaledHeight; rowCount; exceedsLimit }`
  - `function computeExportSize(params): ExportSize`
  - `function sanitizeFilename(name: string): string`
  - `function buildExportFilename(projectName: string, dateYmd: string): string`

- [ ] **Step 1: 실패 테스트 작성**

Create `apps/web/src/lib/ganttExport.test.ts`:

```typescript
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
    expect(sanitizeFilename('a/b:c*?"<>|d')).toBe('a_b_c_____d');
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F @sam/web test`
Expected: FAIL — `Cannot find module './ganttExport'`

- [ ] **Step 3: `ganttExport.ts` 작성**

Create `apps/web/src/lib/ganttExport.ts`:

```typescript
// 간트 이미지 내보내기의 순수 계산 로직(부수효과 없음, 테스트 대상).
import type { NodeTreeItem } from '@sam/shared';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeActiveRange,
  flattenTree,
  type TimelineUnit,
} from './ganttLayout';
import { dayDiff } from './ganttMath';

// 대화상자에서 고르는 펼침 깊이. 'all' = 모두 펼침, 숫자 K = "K단계까지" 표시.
export type DepthOption = 'all' | number;

export const UNIT_LABELS: Record<TimelineUnit, string> = {
  day: '일',
  week: '주',
  month: '월',
  quarter: '분기',
};

// 한 변이 이 픽셀을 넘으면 canvas 한계 위험으로 경고한다.
export const EXPORT_MAX_EDGE = 16000;
export const EXPORT_PIXEL_RATIO = 2;
export const DEFAULT_LABEL_WIDTH = 280;

// 트리에서 가장 깊은 노드의 depth. 노드가 없으면 -1.
export function treeMaxDepth(items: NodeTreeItem[]): number {
  let max = -1;
  for (const n of items) if (n.depth > max) max = n.depth;
  return max;
}

// 사용자에게 보이는 최대 "단계" 수(= 최대 depth + 1). 노드 없으면 0.
export function depthStepCount(items: NodeTreeItem[]): number {
  return treeMaxDepth(items) + 1;
}

// "K단계까지 펼침" → depth >= K-1 인 GROUP 을 접는다(그 아래가 숨는다).
// 'all' 은 아무것도 접지 않는다.
export function collapsedIdsForDepth(
  items: NodeTreeItem[],
  depth: DepthOption,
): Set<string> {
  if (depth === 'all') return new Set();
  const threshold = depth - 1; // 화면 K단계 = depth K-1
  const ids = new Set<string>();
  for (const n of items) {
    if (n.kind === 'GROUP' && n.depth >= threshold) ids.add(n.id);
  }
  return ids;
}

export interface ExportSize {
  hasContent: boolean;
  unit: TimelineUnit;
  labelWidth: number;
  chartWidth: number;
  totalWidth: number;
  totalHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  rowCount: number;
  exceedsLimit: boolean;
}

export function computeExportSize(params: {
  items: NodeTreeItem[];
  collapsedIds: Set<string>;
  unit: TimelineUnit;
  labelWidth: number;
  pixelRatio: number;
  maxEdge: number;
}): ExportSize {
  const { items, collapsedIds, unit, labelWidth, pixelRatio, maxEdge } = params;
  const range = computeActiveRange(items);
  const rowCount = flattenTree(items, collapsedIds).length;

  if (!range) {
    return {
      hasContent: false,
      unit,
      labelWidth,
      chartWidth: 0,
      totalWidth: 0,
      totalHeight: 0,
      scaledWidth: 0,
      scaledHeight: 0,
      rowCount,
      exceedsLimit: false,
    };
  }

  const totalDays = dayDiff(range.end, range.start) + 1;
  const chartWidth = totalDays * PPD[unit];
  const totalWidth = labelWidth + chartWidth;
  const totalHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT;
  const scaledWidth = Math.round(totalWidth * pixelRatio);
  const scaledHeight = Math.round(totalHeight * pixelRatio);
  const exceedsLimit = Math.max(scaledWidth, scaledHeight) > maxEdge;

  return {
    hasContent: true,
    unit,
    labelWidth,
    chartWidth,
    totalWidth,
    totalHeight,
    scaledWidth,
    scaledHeight,
    rowCount,
    exceedsLimit,
  };
}

// 파일명에 쓸 수 없는 문자를 _ 로 바꾼다.
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

export function buildExportFilename(projectName: string, dateYmd: string): string {
  const trimmed = projectName.trim();
  const base = trimmed ? `${sanitizeFilename(trimmed)}_간트` : '간트';
  return `${base}_${dateYmd}.png`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/web test`
Expected: PASS (ganttExport.test.ts 전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/ganttExport.ts apps/web/src/lib/ganttExport.test.ts
git commit -m "feat(web): 간트 이미지 내보내기 순수 로직(깊이/크기/파일명) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 정적 렌더 컴포넌트 (`GanttExportView.tsx`)

스크롤·상호작용·오늘선이 없는 정적 간트. `dark:` 클래스를 쓰지 않고 `theme` prop 기반 인라인 색을 쓴다(전역 테마와 독립).

**Files:**
- Create: `apps/web/src/components/GanttExportView.tsx`

**Interfaces:**
- Consumes: `computeActiveRange`, `computeHeaderCells`, `flattenTree`, `barRect`, `PPD`, `ROW_HEIGHT`, `HEADER_HEIGHT`, `type TimelineUnit` (`../lib/ganttLayout`), `type Theme` (`../lib/theme`), `FolderIcon`/`ItemIcon` (`./Icons`), `NodeTreeItem` (`@sam/shared`).
- Produces:
  - `interface GanttExportViewProps { items: NodeTreeItem[]; unit: TimelineUnit; collapsedIds: Set<string>; theme: Theme; labelWidth: number }`
  - `export default function GanttExportView(props): JSX.Element | null` (일정 없으면 null)
  - `const EXPORT_ROOT_ID = 'gantt-export-root'` (캡처 대상 루트 요소 id, Task 4에서 사용)

- [ ] **Step 1: 컴포넌트 작성**

정적 렌더라 자동 단위 테스트는 없다(실제 그림은 Task 4·6에서 브라우저로 검증). 계산은 Task 1·2에서 이미 테스트됨.

Create `apps/web/src/components/GanttExportView.tsx`:

```typescript
// 이미지 내보내기 전용 정적 간트. 스크롤/드래그/hover/오늘선 없음.
// Tailwind dark: 대신 theme prop 기반 인라인 색을 써서 전역 테마와 독립적으로 그린다.
import type { NodeTreeItem } from '@sam/shared';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeActiveRange,
  computeHeaderCells,
  flattenTree,
  barRect,
  type TimelineUnit,
} from '../lib/ganttLayout';
import type { Theme } from '../lib/theme';
import { FolderIcon, ItemIcon } from './Icons';

export const EXPORT_ROOT_ID = 'gantt-export-root';

interface Palette {
  pageBg: string;
  rowBorder: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  labelText: string;
  progressText: string;
  groupBarBorder: string;
  groupBarBg: string;
  groupFill: string;
  itemBarBorder: string;
  itemBarBg: string;
  itemFill: string;
}

// Tailwind 팔레트를 화면 Timeline 과 최대한 맞춘 고정 색.
const LIGHT: Palette = {
  pageBg: '#ffffff',
  rowBorder: '#f1f5f9', // slate-100
  headerBg: '#f8fafc', // slate-50
  headerBorder: '#e2e8f0', // slate-200
  headerText: '#475569', // slate-600
  labelText: '#0f172a', // slate-900
  progressText: '#64748b', // slate-500
  groupBarBorder: '#c4b5fd', // violet-300
  groupBarBg: '#ede9fe', // violet-100
  groupFill: '#a78bfa', // violet-400
  itemBarBorder: '#38bdf8', // sky-400
  itemBarBg: '#e0f2fe', // sky-100
  itemFill: '#0ea5e9', // sky-500
};

const DARK: Palette = {
  pageBg: '#0f172a', // slate-900
  rowBorder: '#1e293b', // slate-800
  headerBg: '#1e293b', // slate-800
  headerBorder: '#334155', // slate-700
  headerText: '#94a3b8', // slate-400
  labelText: '#e2e8f0', // slate-200
  progressText: '#94a3b8', // slate-400
  groupBarBorder: '#6d28d9', // violet-700
  groupBarBg: 'rgba(76,29,149,0.4)', // violet-900/40
  groupFill: 'rgba(167,139,250,0.7)', // violet-400/70
  itemBarBorder: '#0369a1', // sky-700
  itemBarBg: 'rgba(12,74,110,0.4)', // sky-900/40
  itemFill: 'rgba(14,165,233,0.8)', // sky-500/80
};

export interface GanttExportViewProps {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  collapsedIds: Set<string>;
  theme: Theme;
  labelWidth: number;
}

export default function GanttExportView({
  items,
  unit,
  collapsedIds,
  theme,
  labelWidth,
}: GanttExportViewProps) {
  const range = computeActiveRange(items);
  if (!range) return null;

  const p = theme === 'dark' ? DARK : LIGHT;
  const ppd = PPD[unit];
  const totalDays =
    Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;
  const chartWidth = totalDays * ppd;
  const totalWidth = labelWidth + chartWidth;
  const flat = flattenTree(items, collapsedIds);
  const headerCells = computeHeaderCells(range, unit, ppd);

  return (
    <div
      id={EXPORT_ROOT_ID}
      style={{
        width: totalWidth,
        background: p.pageBg,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Malgun Gothic", sans-serif',
      }}
    >
      {/* 헤더 (라벨 모서리 + 날짜 눈금) */}
      <div
        style={{
          display: 'flex',
          height: HEADER_HEIGHT,
          background: p.headerBg,
          borderBottom: `1px solid ${p.headerBorder}`,
        }}
      >
        <div
          style={{
            width: labelWidth,
            flexShrink: 0,
            borderRight: `1px solid ${p.headerBorder}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            fontSize: 12,
            fontWeight: 600,
            color: p.headerText,
          }}
        >
          일정 ({items.length}개)
        </div>
        <div style={{ position: 'relative', width: chartWidth }}>
          {headerCells.map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: c.offsetPx,
                width: c.widthPx,
                height: '100%',
                borderLeft: `1px solid ${p.headerBorder}`,
                display: 'flex',
                flexDirection: c.subLabel ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 500,
                color: p.headerText,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{c.label}</span>
              {c.subLabel && (
                <span style={{ fontSize: 9, opacity: 0.75 }}>{c.subLabel}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 행 */}
      <div style={{ position: 'relative' }}>
        {flat.map((n) => {
          const isGroup = n.kind === 'GROUP';
          const start = isGroup ? n.startAtEffective : n.startAt;
          const end = isGroup ? n.endAtEffective : n.endAt;
          const progress = isGroup ? n.progressEffective : n.progress;
          const rect = start && end ? barRect(start, end, range.start, ppd) : null;

          return (
            <div
              key={n.id}
              style={{
                display: 'flex',
                height: ROW_HEIGHT,
                borderBottom: `1px solid ${p.rowBorder}`,
              }}
            >
              {/* 라벨 */}
              <div
                style={{
                  width: labelWidth,
                  flexShrink: 0,
                  borderRight: `1px solid ${p.headerBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 8 + n.depth * 16,
                  paddingRight: 8,
                  fontSize: 12,
                  color: p.labelText,
                  background: p.pageBg,
                }}
              >
                {isGroup ? (
                  <FolderIcon className="w-4 h-4" />
                ) : (
                  <ItemIcon className="w-4 h-4" />
                )}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.title}
                </span>
                {progress !== null && progress !== undefined && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      color: p.progressText,
                    }}
                  >
                    {progress}%
                  </span>
                )}
              </div>

              {/* 막대 영역 */}
              <div style={{ position: 'relative', width: chartWidth }}>
                {rect && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      bottom: 4,
                      left: rect.leftPx,
                      width: rect.widthPx,
                      borderRadius: 4,
                      overflow: 'hidden',
                      border: `1px solid ${isGroup ? p.groupBarBorder : p.itemBarBorder}`,
                      background: isGroup ? p.groupBarBg : p.itemBarBg,
                    }}
                  >
                    {progress !== null && progress !== undefined && progress > 0 && (
                      <div
                        style={{
                          height: '100%',
                          width: `${progress}%`,
                          background: isGroup ? p.groupFill : p.itemFill,
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/GanttExportView.tsx
git commit -m "feat(web): 이미지 내보내기용 정적 간트 뷰 컴포넌트 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `html-to-image` 설치 + 캡처 실행 (`exportGanttImage.ts`)

화면 밖에 `GanttExportView`를 렌더 → PNG 캡처 → 다운로드 → 정리. 부수효과 함수라 자동 테스트 대신 브라우저 수동 검증을 한다.

**Files:**
- Modify: `apps/web/package.json` (의존성)
- Create: `apps/web/src/lib/exportGanttImage.ts`

**Interfaces:**
- Consumes: `toPng` (`html-to-image`), `createRoot` (`react-dom/client`), `GanttExportView`, `EXPORT_ROOT_ID` (`../components/GanttExportView`), `buildExportFilename` (`./ganttExport`), `type TimelineUnit` (`./ganttLayout`), `type Theme` (`./theme`), `NodeTreeItem` (`@sam/shared`).
- Produces:
  - `interface ExportGanttImageOptions { items; unit; collapsedIds; theme; projectName; dateYmd; labelWidth; pixelRatio }`
  - `async function exportGanttImage(opts): Promise<void>`

- [ ] **Step 1: 의존성 설치**

Run: `pnpm -F @sam/web add html-to-image`
Expected: `apps/web/package.json`의 `dependencies`에 `html-to-image`가 추가된다.

- [ ] **Step 2: 캡처 실행 함수 작성**

Create `apps/web/src/lib/exportGanttImage.ts`:

```typescript
// 화면 밖에 정적 간트를 렌더해 PNG 로 캡처하고 내려받는다(부수효과).
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import type { NodeTreeItem } from '@sam/shared';
import GanttExportView, { EXPORT_ROOT_ID } from '../components/GanttExportView';
import { buildExportFilename } from './ganttExport';
import type { TimelineUnit } from './ganttLayout';
import type { Theme } from './theme';

export interface ExportGanttImageOptions {
  items: NodeTreeItem[];
  unit: TimelineUnit;
  collapsedIds: Set<string>;
  theme: Theme;
  projectName: string;
  dateYmd: string;
  labelWidth: number;
  pixelRatio: number;
}

// 두 번의 애니메이션 프레임을 기다려 React 렌더/레이아웃이 끝나게 한다.
function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function exportGanttImage(opts: ExportGanttImageOptions): Promise<void> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(
      createElement(GanttExportView, {
        items: opts.items,
        unit: opts.unit,
        collapsedIds: opts.collapsedIds,
        theme: opts.theme,
        labelWidth: opts.labelWidth,
      }),
    );

    await nextFrames();

    const target = host.querySelector<HTMLElement>(`#${EXPORT_ROOT_ID}`);
    if (!target) {
      throw new Error('내보낼 간트 내용이 없습니다.');
    }

    const dataUrl = await toPng(target, {
      pixelRatio: opts.pixelRatio,
      backgroundColor: opts.theme === 'dark' ? '#0f172a' : '#ffffff',
      cacheBust: true,
    });

    const link = document.createElement('a');
    link.download = buildExportFilename(opts.projectName, opts.dateYmd);
    link.href = dataUrl;
    link.click();
  } finally {
    root.unmount();
    host.remove();
  }
}
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음 (`html-to-image`는 자체 타입을 포함한다)

- [ ] **Step 4: 커밋**

```bash
git add apps/web/package.json apps/web/src/lib/exportGanttImage.ts ../../pnpm-lock.yaml
git commit -m "feat(web): html-to-image 도입 및 간트 PNG 캡처 실행 함수 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(주의: `pnpm-lock.yaml`은 저장소 루트에 있다. `git add` 시 실제 경로에 맞춘다.)

---

## Task 5: 설정 대화상자 (`GanttExportDialog.tsx`)

눈금·깊이·테마 선택 + 예상 크기 + 한계 경고 + 내보내기 버튼.

**Files:**
- Create: `apps/web/src/components/GanttExportDialog.tsx`

**Interfaces:**
- Consumes: `collapsedIdsForDepth`, `computeExportSize`, `depthStepCount`, `buildExportFilename`(간접), `UNIT_LABELS`, `EXPORT_MAX_EDGE`, `EXPORT_PIXEL_RATIO`, `DEFAULT_LABEL_WIDTH`, `type DepthOption` (`../lib/ganttExport`), `exportGanttImage` (`../lib/exportGanttImage`), `todayUtc` (`../lib/ganttLayout`), `formatYmd` (`../lib/ganttMath`), `type TimelineUnit` (`../lib/ganttLayout`), `type Theme` (`../lib/theme`), `toast` (`../lib/toast`), `NodeTreeItem` (`@sam/shared`).
- Produces:
  - `interface GanttExportDialogProps { items; currentUnit; currentTheme; projectName; onClose }`
  - `export default function GanttExportDialog(props): JSX.Element`

- [ ] **Step 1: 대화상자 작성**

Create `apps/web/src/components/GanttExportDialog.tsx`:

```typescript
import { useEffect, useMemo, useState } from 'react';
import type { NodeTreeItem } from '@sam/shared';
import {
  collapsedIdsForDepth,
  computeExportSize,
  depthStepCount,
  UNIT_LABELS,
  EXPORT_MAX_EDGE,
  EXPORT_PIXEL_RATIO,
  DEFAULT_LABEL_WIDTH,
  type DepthOption,
} from '../lib/ganttExport';
import { exportGanttImage } from '../lib/exportGanttImage';
import { todayUtc, type TimelineUnit } from '../lib/ganttLayout';
import { formatYmd } from '../lib/ganttMath';
import type { Theme } from '../lib/theme';
import { toast } from '../lib/toast';

const UNITS: TimelineUnit[] = ['day', 'week', 'month', 'quarter'];

interface GanttExportDialogProps {
  items: NodeTreeItem[];
  currentUnit: TimelineUnit;
  currentTheme: Theme;
  projectName: string;
  onClose: () => void;
}

// 화면 Timeline 과 같은 라벨 폭(localStorage)을 읽는다.
function readLabelWidth(): number {
  const saved =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('sam_gantt_label_width')
      : null;
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && parsed >= 150 && parsed <= 600) return parsed;
  }
  return DEFAULT_LABEL_WIDTH;
}

export default function GanttExportDialog({
  items,
  currentUnit,
  currentTheme,
  projectName,
  onClose,
}: GanttExportDialogProps) {
  const [unit, setUnit] = useState<TimelineUnit>(currentUnit);
  const [depth, setDepth] = useState<DepthOption>('all');
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [busy, setBusy] = useState(false);

  const labelWidth = useMemo(() => readLabelWidth(), []);
  const stepCount = useMemo(() => depthStepCount(items), [items]);
  const collapsedIds = useMemo(
    () => collapsedIdsForDepth(items, depth),
    [items, depth],
  );
  const size = useMemo(
    () =>
      computeExportSize({
        items,
        collapsedIds,
        unit,
        labelWidth,
        pixelRatio: EXPORT_PIXEL_RATIO,
        maxEdge: EXPORT_MAX_EDGE,
      }),
    [items, collapsedIds, unit, labelWidth],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const canExport = size.hasContent && !size.exceedsLimit && !busy;

  const handleExport = async () => {
    if (!canExport) return;
    setBusy(true);
    try {
      await exportGanttImage({
        items,
        unit,
        collapsedIds,
        theme,
        projectName,
        dateYmd: formatYmd(todayUtc()),
        labelWidth,
        pixelRatio: EXPORT_PIXEL_RATIO,
      });
      toast.success('간트 이미지를 내려받았습니다.');
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : '이미지 내보내기에 실패했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  // 깊이 선택지: 전체 + 1..stepCount 단계
  const depthOptions: { value: DepthOption; label: string }[] = [
    { value: 'all', label: '전체' },
    ...Array.from({ length: Math.max(0, stepCount) }, (_, i) => ({
      value: (i + 1) as DepthOption,
      label: `${i + 1}단계`,
    })),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-md flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          이미지로 내보내기 (PNG)
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          선택한 깊이까지 펼쳐지고, 오늘 날짜선은 빠집니다.
        </p>

        <div className="mt-4 space-y-4">
          {/* 눈금 단위 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              눈금 단위
            </div>
            <div className="flex gap-1">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    unit === u
                      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {UNIT_LABELS[u]}
                </button>
              ))}
            </div>
          </div>

          {/* 펼침 깊이 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              펼침 깊이
            </div>
            <select
              value={String(depth)}
              onChange={(e) =>
                setDepth(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {depthOptions.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 테마 */}
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              테마
            </div>
            <div className="flex gap-1">
              {(['light', 'dark'] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    theme === t
                      ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {t === 'light' ? '라이트' : '다크'}
                </button>
              ))}
            </div>
          </div>

          {/* 예상 크기 / 경고 */}
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
            {!size.hasContent ? (
              <span className="text-amber-600 dark:text-amber-400">
                내보낼 일정(날짜)이 없습니다.
              </span>
            ) : (
              <div className="space-y-1">
                <div className="text-slate-600 dark:text-slate-300">
                  예상 크기: 약 <b>{size.scaledWidth.toLocaleString()}</b> ×{' '}
                  <b>{size.scaledHeight.toLocaleString()}</b> px (해상도 2배 · 표시{' '}
                  {size.rowCount}행)
                </div>
                {size.exceedsLimit && (
                  <div className="text-rose-600 dark:text-rose-400">
                    이미지가 너무 큽니다(한 변 {EXPORT_MAX_EDGE.toLocaleString()}px
                    초과). 눈금을 더 굵게 하거나 펼침 깊이를 줄여 주세요.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            취소 (ESC)
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            {busy ? '내보내는 중…' : '내보내기'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/GanttExportDialog.tsx
git commit -m "feat(web): 간트 이미지 내보내기 설정 대화상자 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Export 드롭다운 + 페이지 연결

**Files:**
- Create: `apps/web/src/components/ExportMenu.tsx`
- Modify: `apps/web/src/pages/ProjectTimelinePage.tsx`

**Interfaces:**
- `ExportMenu` Produces: `interface ExportMenuProps { onSelectImage: () => void }`, `export default function ExportMenu(props): JSX.Element`
- `ProjectTimelinePage` Consumes: `ExportMenu`, `GanttExportDialog`, `useTheme` (`../lib/theme`).

- [ ] **Step 1: 드롭다운 컴포넌트 작성**

Create `apps/web/src/components/ExportMenu.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';

interface ExportMenuProps {
  onSelectImage: () => void;
}

export default function ExportMenu({ onSelectImage }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Export
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSelectImage();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            이미지로 내보내기 (PNG)
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 페이지에 연결**

`apps/web/src/pages/ProjectTimelinePage.tsx` 수정:

1. import 추가(기존 import 블록 아래):
   ```typescript
   import ExportMenu from '../components/ExportMenu';
   import GanttExportDialog from '../components/GanttExportDialog';
   import { useTheme } from '../lib/theme';
   ```
2. 컴포넌트 본문 상단 상태에 추가(`const timelineRef = useRef ...` 다음 줄):
   ```typescript
   const [exportOpen, setExportOpen] = useState(false);
   const { theme } = useTheme();
   ```
3. 헤더 툴바에서 "Tree 뷰" `<Link>` **바로 앞**에 드롭다운을 넣는다(102~107줄의 `<Link to={`/projects/${id}`} …>Tree 뷰</Link>` 앞):
   ```tsx
   <ExportMenu onSelectImage={() => setExportOpen(true)} />
   ```
4. `</main>` 닫기 직전(138줄 `</div>` 다음, `</main>` 앞)에 대화상자를 넣는다:
   ```tsx
   {exportOpen && (
     <GanttExportDialog
       items={nodes.data ?? []}
       currentUnit={unit}
       currentTheme={theme}
       projectName={project.data.name}
       onClose={() => setExportOpen(false)}
     />
   )}
   ```

- [ ] **Step 3: 타입 검사 + 빌드**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음
Run: `pnpm -F @sam/web build`
Expected: 빌드 성공

- [ ] **Step 4: 브라우저 수동 검증**

개발 서버(`pnpm dev`)에서 `http://localhost:5173`로 접속해 일정이 있는 프로젝트의 Timeline 뷰(`/projects/:id/timeline`)를 연다. 아래를 확인한다:

1. 헤더에 **"Export ▾"** 버튼이 보이고, 클릭하면 "이미지로 내보내기 (PNG)" 항목이 뜬다. 바깥을 클릭하면 닫힌다.
2. 항목을 누르면 설정 대화상자가 뜬다. 눈금/깊이/테마를 바꾸면 **예상 크기**가 즉시 갱신된다.
3. **[내보내기]** → PNG 파일이 `{프로젝트명}_간트_2026-07-20.png` 이름으로 내려받아진다.
4. 내려받은 이미지를 열어 확인:
   - **모든 노드가 펼쳐져** 있다(깊이 "전체"일 때).
   - **오늘 날짜선(빨간 세로선)이 없다.**
   - 막대·색·진행률이 화면과 같다.
5. **펼침 깊이**를 "2단계"로 바꿔 내보내면, depth 2 이상(3단계 이하)이 접힌 상태로 나온다.
6. **테마**를 화면과 반대로 바꿔 내보내면, 이미지가 그 테마 색(라이트=흰 배경 / 다크=짙은 배경)으로 나온다. 이때 화면 자체 테마는 바뀌지 않는다.
7. 눈금을 "일"로, 긴 기간 프로젝트에서 예상 크기가 한계를 넘으면 **경고가 뜨고 [내보내기]가 비활성화**된다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/ExportMenu.tsx apps/web/src/pages/ProjectTimelinePage.tsx
git commit -m "feat(web): 타임라인 뷰에 Export 드롭다운·이미지 내보내기 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (계획 작성자 확인 완료)

- **Spec 4.1 드롭다운 버튼** → Task 6 (ExportMenu).
- **Spec 4.2 대화상자(눈금·깊이·테마·해상도·예상크기·경고)** → Task 5.
- **Spec 5 펼침 깊이 규칙** → Task 2 `collapsedIdsForDepth` + 테스트, Task 5 선택지 노출.
- **Spec 6 생성 절차(화면 밖 렌더·오늘선 제거·전체 크기·테마·배경색)** → Task 3(정적 뷰) + Task 4(캡처).
- **Spec 7 크기 계산** → Task 2 `computeExportSize` + 테스트.
- **Spec 8 정적 전용 컴포넌트 + 공용 함수 추출** → Task 1(추출) + Task 3(정적 뷰).
- **Spec 9 폐쇄망 의존성** → Task 4 Step 1 (`dependency` 설치).
- **Spec 10 범위 밖** → 계획에 포함하지 않음(YAGNI 준수).

**Placeholder 스캔**: TBD/TODO 없음. 모든 코드 step에 실제 코드 포함.
**타입 일관성**: `TimelineUnit`/`DepthOption`/`ExportSize`/`GanttExportViewProps`/`ExportGanttImageOptions` 이름과 시그니처가 태스크 간 일치. `EXPORT_ROOT_ID`는 Task 3에서 정의하고 Task 4에서 사용.
**주의(실행 시 확인)**: `pnpm-lock.yaml` 경로는 저장소 루트다. Task 1 Step 5의 로컬 정의 삭제는 겉보기 동작을 바꾸지 않아야 하며, `pnpm -F @sam/web build`로 회귀를 확인한다.
