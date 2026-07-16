# 프로젝트 이력 조회 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트별로 이력·댓글을 다섯 주제(모든 이력/진행률 낮춤/삭제 이력/기간 변경/댓글)와 세 기간(7일/30일/직접 범위)으로 조회하는 화면과 API를 추가한다.

**Architecture:** 이미 쌓이는 `NodeHistory`·`NodeComment`를 읽기만 하는 조회 계층이다(DB 스키마 변경 없음). 판정·집계 같은 순수 로직은 `packages/shared`에 두어 백엔드 필터와 프론트 렌더가 공유하고 단위 테스트한다. 백엔드는 프로젝트 단위 엔드포인트 하나(`GET /projects/:id/history`)가 기간·주제로 필터링해 시간 역순 목록을 돌려준다. 프론트는 독립 페이지(`/projects/:id/history`)에서 주제 칩·기간 선택으로 그 목록을 보여준다.

**Tech Stack:** NestJS 10 + Prisma(SQLite), React 18 + Vite + TanStack Query, Zod(`@sam/shared`), Vitest.

## Global Constraints

- 코드 수정 후 반드시 `pnpm -r typecheck`로 컴파일 확인(AGENTS.md 4.1).
- `packages/shared`를 고치면 프론트/백엔드가 참조하는 `dist`가 낡으므로, 이후 typecheck·web 테스트 전에 반드시 `pnpm -F @sam/shared build`를 먼저 실행한다(AGENTS.md 5.3).
- 데이터 검증은 `class-validator`가 아니라 `packages/shared`의 Zod 스키마 + `ZodValidationPipe`로만 한다(AGENTS.md 4.2).
- 상태 변경 라우트가 아니어도(읽기 GET) 기존 `HistoryController` 관례에 맞춰 `@UseGuards(OriginGuard)`를 붙인다.
- 터미널에서 `cd`를 독립 실행하지 않는다. 워크스페이스 명령은 루트에서 `pnpm -F <pkg> ...`로 실행한다(AGENTS.md 4.1).
- 기존 인라인 주석·docstring은 기능과 무관하면 보존한다(AGENTS.md 4.1).
- **DB 스키마/마이그레이션 변경 없음.** 기존 테이블을 읽기만 한다.
- 작업 브랜치는 `master`(사용자 지정). 각 태스크 끝에서 커밋한다.

---

## File Structure

**신규 (Create)**
- `packages/shared/src/history-utils.ts` — 순수 판정·집계 함수와 데이터 타입(백엔드·프론트 공용).
- `packages/shared/src/history-utils.test.ts` — 위 함수들의 단위 테스트(shared vitest).
- `apps/api/src/nodes/project-history.service.ts` — Prisma 조회 + 기간창 계산 + 제목/삭제상태 해석 후 shared 집계에 위임.
- `apps/api/src/nodes/project-history.controller.ts` — `GET /projects/:id/history` 엔드포인트.
- `apps/web/src/lib/historyView.tsx` — 종류별 아이콘/색 map, 짧은 라벨 문자열 함수, 시각 포맷(프론트 공용 렌더 조각).
- `apps/web/src/lib/historyView.test.ts` — 라벨 문자열 함수 단위 테스트(web vitest).
- `apps/web/src/lib/projectHistory.ts` — `useProjectHistory` 조회 훅.
- `apps/web/src/pages/ProjectHistoryPage.tsx` — 이력 조회 페이지.

**수정 (Modify)**
- `packages/shared/package.json` — vitest devDep + `test` 스크립트 추가.
- `packages/shared/src/index.ts` — history-utils 재노출 + HTTP DTO(Zod) 추가.
- `apps/api/src/nodes/nodes.module.ts` — 새 컨트롤러/서비스 등록.
- `apps/web/src/App.tsx` — `/projects/:id/history` 라우트 추가.
- `apps/web/src/pages/ProjectDetailPage.tsx` — 헤더에 "이력" 링크 추가.
- `apps/web/src/components/ActivityFeedPanel.tsx` — 공용 짧은 라벨/포맷 사용(스펙에 따라 기존 장황한 문장이 짧은 라벨로 바뀜).

---

## Task 1: 공유 판정 함수 + shared 테스트 설정

diff(`{ field: { from, to } }`)를 해석하는 순수 함수를 만들고, `packages/shared`에 vitest를 붙여 단위 테스트한다.

**Files:**
- Create: `packages/shared/src/history-utils.ts`
- Modify: `packages/shared/package.json`
- Test: `packages/shared/src/history-utils.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces:
  - `type DiffMap = Record<string, unknown>`
  - `type ChangeKind = 'PROGRESS_UP'|'PROGRESS_DOWN'|'PROGRESS_DONE'|'PROGRESS_SET'|'PERIOD'|'TITLE'|'CREATE'|'MOVE'|'DELETE'|'RESTORE'|'OTHER'`
  - `getProgressChange(diff: DiffMap): { from: number; to: number } | null`
  - `isProgressDown(diff: DiffMap): boolean`
  - `isPeriodChange(diff: DiffMap): boolean`
  - `classifyChange(action: string, diff: DiffMap): ChangeKind`

- [ ] **Step 1: shared에 vitest 추가**

`packages/shared/package.json`의 `scripts`에 `test`를, `devDependencies`에 `vitest`를 추가한다(web과 동일 버전).

```json
{
  "name": "@sam/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "^2.1.8"
  }
}
```

그런 다음 루트에서 설치:

```bash
pnpm install
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/shared/src/history-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getProgressChange,
  isProgressDown,
  isPeriodChange,
  classifyChange,
} from './history-utils';

describe('getProgressChange', () => {
  it('progress 의 from/to 가 숫자면 그대로 반환', () => {
    expect(getProgressChange({ progress: { from: 80, to: 50 } })).toEqual({ from: 80, to: 50 });
  });
  it('progress 가 없으면 null', () => {
    expect(getProgressChange({ title: { from: 'a', to: 'b' } })).toBeNull();
  });
  it('from/to 가 숫자가 아니면 null', () => {
    expect(getProgressChange({ progress: { from: null, to: 50 } })).toBeNull();
  });
});

describe('isProgressDown', () => {
  it('to < from 이면 참', () => {
    expect(isProgressDown({ progress: { from: 80, to: 50 } })).toBe(true);
  });
  it('to > from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 80 } })).toBe(false);
  });
  it('to === from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 50 } })).toBe(false);
  });
  it('progress 변경이 없으면 거짓', () => {
    expect(isProgressDown({ title: { from: 'a', to: 'b' } })).toBe(false);
  });
});

describe('isPeriodChange', () => {
  it('startAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ startAt: { from: '2026-01-01', to: '2026-01-02' } })).toBe(true);
  });
  it('endAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ endAt: { from: null, to: '2026-02-15' } })).toBe(true);
  });
  it('기간 필드가 없으면 거짓', () => {
    expect(isPeriodChange({ progress: { from: 10, to: 20 } })).toBe(false);
  });
});

describe('classifyChange', () => {
  it('UPDATE + 진행률 내림 → PROGRESS_DOWN', () => {
    expect(classifyChange('UPDATE', { progress: { from: 80, to: 50 } })).toBe('PROGRESS_DOWN');
  });
  it('UPDATE + 진행률 올림 → PROGRESS_UP', () => {
    expect(classifyChange('UPDATE', { progress: { from: 50, to: 80 } })).toBe('PROGRESS_UP');
  });
  it('UPDATE + 100% 도달 → PROGRESS_DONE', () => {
    expect(classifyChange('UPDATE', { progress: { from: 90, to: 100 } })).toBe('PROGRESS_DONE');
  });
  it('UPDATE + 기간 변경 → PERIOD', () => {
    expect(classifyChange('UPDATE', { endAt: { from: '2026-01-31', to: '2026-02-15' } })).toBe('PERIOD');
  });
  it('UPDATE + 제목 변경 → TITLE', () => {
    expect(classifyChange('UPDATE', { title: { from: 'a', to: 'b' } })).toBe('TITLE');
  });
  it('DELETE → DELETE', () => {
    expect(classifyChange('DELETE', {})).toBe('DELETE');
  });
  it('CREATE → CREATE', () => {
    expect(classifyChange('CREATE', {})).toBe('CREATE');
  });
  it('MOVE → MOVE', () => {
    expect(classifyChange('MOVE', {})).toBe('MOVE');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `pnpm -F @sam/shared test`
Expected: FAIL — `history-utils.ts` 모듈/함수가 없어 import 에러.

- [ ] **Step 4: 최소 구현 작성**

`packages/shared/src/history-utils.ts`:

```ts
// diff 판정 (백엔드 필터 + 프론트 분류 공용). diff 는 { field: { from, to } } 형태.
export type DiffMap = Record<string, unknown>;

export type ChangeKind =
  | 'PROGRESS_UP'
  | 'PROGRESS_DOWN'
  | 'PROGRESS_DONE'
  | 'PROGRESS_SET'
  | 'PERIOD'
  | 'TITLE'
  | 'CREATE'
  | 'MOVE'
  | 'DELETE'
  | 'RESTORE'
  | 'OTHER';

interface FromTo {
  from: unknown;
  to: unknown;
}

function asField(v: unknown): FromTo | null {
  if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
    return v as FromTo;
  }
  return null;
}

export function getProgressChange(diff: DiffMap): { from: number; to: number } | null {
  const f = asField(diff.progress);
  if (!f) return null;
  if (typeof f.from !== 'number' || typeof f.to !== 'number') return null;
  return { from: f.from, to: f.to };
}

export function isProgressDown(diff: DiffMap): boolean {
  const p = getProgressChange(diff);
  return p !== null && p.to < p.from;
}

export function isPeriodChange(diff: DiffMap): boolean {
  return asField(diff.startAt) !== null || asField(diff.endAt) !== null;
}

export function classifyChange(action: string, diff: DiffMap): ChangeKind {
  switch (action) {
    case 'CREATE':
      return 'CREATE';
    case 'DELETE':
      return 'DELETE';
    case 'RESTORE':
      return 'RESTORE';
    case 'MOVE':
      return 'MOVE';
    case 'UPDATE': {
      const p = getProgressChange(diff);
      if (p) {
        if (p.to === p.from) return 'PROGRESS_SET';
        if (p.to === 100) return 'PROGRESS_DONE';
        return p.to > p.from ? 'PROGRESS_UP' : 'PROGRESS_DOWN';
      }
      if (isPeriodChange(diff)) return 'PERIOD';
      if (asField(diff.title)) return 'TITLE';
      return 'OTHER';
    }
    default:
      return 'OTHER';
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm -F @sam/shared test`
Expected: PASS (모든 테스트 통과).

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/package.json packages/shared/src/history-utils.ts packages/shared/src/history-utils.test.ts pnpm-lock.yaml
git commit -m "feat(shared): 이력 diff 판정 함수 + shared vitest 추가"
```

---

## Task 2: 공유 집계 함수 (주제 필터 + 병합/상한)

Prisma에 의존하지 않는 순수 데이터로 "주제별 필터 + 이력·댓글 병합 + 시간 역순 정렬 + 상한 절단"을 수행하는 함수를 만든다. 백엔드는 Prisma 결과를 이 입력 형태로 바꿔 호출한다.

**Files:**
- Modify: `packages/shared/src/history-utils.ts`
- Test: `packages/shared/src/history-utils.test.ts`

**Interfaces:**
- Consumes: Task 1의 `DiffMap`, `isProgressDown`, `isPeriodChange`.
- Produces:
  - `const HISTORY_TOPICS = ['ALL','PROGRESS_DOWN','DELETED','PERIOD_CHANGE','COMMENTS'] as const`
  - `type HistoryTopicValue = typeof HISTORY_TOPICS[number]`
  - `const HISTORY_RANGES = ['1w','1m','custom'] as const`
  - `type HistoryRangeValue = typeof HISTORY_RANGES[number]`
  - `interface RawHistoryRow { id; nodeIdSnapshot; projectIdSnapshot; actorId; actorUsername; actorDisplayName; action: 'CREATE'|'UPDATE'|'MOVE'|'DELETE'|'RESTORE'; diff: DiffMap; occurredAt: string }`
  - `interface RawCommentRow { id; nodeId; authorId; authorUsername; authorDisplayName; body; createdAt: string; updatedAt: string }`
  - `interface NodeMeta { title: string; deleted: boolean }`
  - `type HistoryEntryData` / `type CommentEntryData` / `type ProjectHistoryEntryData`
  - `interface AggregateResult { items: ProjectHistoryEntryData[]; truncated: boolean }`
  - `selectHistoryByTopic(rows: RawHistoryRow[], topic: HistoryTopicValue): RawHistoryRow[]`
  - `buildProjectHistory(input): AggregateResult`

- [ ] **Step 1: 실패하는 테스트 추가**

`packages/shared/src/history-utils.test.ts` 하단에 추가하고, 파일 상단 import에 `selectHistoryByTopic, buildProjectHistory, type RawHistoryRow, type RawCommentRow, type NodeMeta`를 더한다.

```ts
import {
  getProgressChange,
  isProgressDown,
  isPeriodChange,
  classifyChange,
  selectHistoryByTopic,
  buildProjectHistory,
  type RawHistoryRow,
  type RawCommentRow,
  type NodeMeta,
} from './history-utils';

function hist(partial: Partial<RawHistoryRow> & { id: string }): RawHistoryRow {
  return {
    nodeIdSnapshot: 'n1',
    projectIdSnapshot: 'p1',
    actorId: 'u1',
    actorUsername: 'user1',
    actorDisplayName: '사용자1',
    action: 'UPDATE',
    diff: {},
    occurredAt: '2026-07-10T00:00:00.000Z',
    ...partial,
  };
}
function cmt(partial: Partial<RawCommentRow> & { id: string }): RawCommentRow {
  return {
    nodeId: 'n1',
    authorId: 'u1',
    authorUsername: 'user1',
    authorDisplayName: '사용자1',
    body: '댓글',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...partial,
  };
}

describe('selectHistoryByTopic', () => {
  const rows: RawHistoryRow[] = [
    hist({ id: 'a', action: 'UPDATE', diff: { progress: { from: 80, to: 50 } } }),
    hist({ id: 'b', action: 'UPDATE', diff: { progress: { from: 50, to: 80 } } }),
    hist({ id: 'c', action: 'DELETE', diff: {} }),
    hist({ id: 'd', action: 'UPDATE', diff: { endAt: { from: '2026-01-01', to: '2026-02-01' } } }),
  ];
  it('PROGRESS_DOWN 은 진행률 내림만', () => {
    expect(selectHistoryByTopic(rows, 'PROGRESS_DOWN').map(r => r.id)).toEqual(['a']);
  });
  it('DELETED 은 삭제만', () => {
    expect(selectHistoryByTopic(rows, 'DELETED').map(r => r.id)).toEqual(['c']);
  });
  it('PERIOD_CHANGE 는 기간 변경만', () => {
    expect(selectHistoryByTopic(rows, 'PERIOD_CHANGE').map(r => r.id)).toEqual(['d']);
  });
  it('ALL 은 전부', () => {
    expect(selectHistoryByTopic(rows, 'ALL')).toHaveLength(4);
  });
  it('COMMENTS 는 이력 없음', () => {
    expect(selectHistoryByTopic(rows, 'COMMENTS')).toHaveLength(0);
  });
});

describe('buildProjectHistory', () => {
  const meta = new Map<string, NodeMeta>([
    ['n1', { title: '살아있는 일정', deleted: false }],
    ['n2', { title: '지워진 일정', deleted: true }],
  ]);

  it('ALL 은 이력과 댓글을 시간 역순으로 병합', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', occurredAt: '2026-07-10T00:00:00.000Z' })],
      comments: [cmt({ id: 'c1', createdAt: '2026-07-11T00:00:00.000Z' })],
      meta,
      topic: 'ALL',
      limit: 500,
    });
    expect(res.items.map(i => i.type)).toEqual(['COMMENT', 'HISTORY']); // 최신(댓글)이 먼저
    expect(res.truncated).toBe(false);
  });

  it('COMMENTS 는 댓글만', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a' })],
      comments: [cmt({ id: 'c1' })],
      meta,
      topic: 'COMMENTS',
      limit: 500,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.type).toBe('COMMENT');
  });

  it('삭제된 노드는 nodeDeleted=true 와 복원 제목을 싣는다', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', nodeIdSnapshot: 'n2', action: 'DELETE' })],
      comments: [],
      meta,
      topic: 'DELETED',
      limit: 500,
    });
    expect(res.items[0]).toMatchObject({ type: 'HISTORY', nodeDeleted: true, nodeTitle: '지워진 일정' });
  });

  it('meta 에 없는 노드는 nodeDeleted=true + 기본 제목', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', nodeIdSnapshot: 'nX' })],
      comments: [],
      meta,
      topic: 'ALL',
      limit: 500,
    });
    expect(res.items[0]).toMatchObject({ nodeDeleted: true, nodeTitle: '(제목 없음)' });
  });

  it('limit 초과 시 잘라내고 truncated=true', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      hist({ id: `h${i}`, occurredAt: `2026-07-0${i + 1}T00:00:00.000Z` }),
    );
    const res = buildProjectHistory({ history, comments: [], meta, topic: 'ALL', limit: 3 });
    expect(res.items).toHaveLength(3);
    expect(res.truncated).toBe(true);
    expect(res.items[0]!.type === 'HISTORY' && res.items[0]!.occurredAt).toBe('2026-07-05T00:00:00.000Z'); // 최신부터
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm -F @sam/shared test`
Expected: FAIL — `selectHistoryByTopic`/`buildProjectHistory` 미정의.

- [ ] **Step 3: 최소 구현 추가**

`packages/shared/src/history-utils.ts` 하단에 추가:

```ts
// ── 프로젝트 이력 집계 (백엔드가 Prisma 결과를 이 형태로 변환해 호출) ──

export const HISTORY_TOPICS = ['ALL', 'PROGRESS_DOWN', 'DELETED', 'PERIOD_CHANGE', 'COMMENTS'] as const;
export type HistoryTopicValue = (typeof HISTORY_TOPICS)[number];

export const HISTORY_RANGES = ['1w', '1m', 'custom'] as const;
export type HistoryRangeValue = (typeof HISTORY_RANGES)[number];

export interface RawHistoryRow {
  id: string;
  nodeIdSnapshot: string;
  projectIdSnapshot: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  action: 'CREATE' | 'UPDATE' | 'MOVE' | 'DELETE' | 'RESTORE';
  diff: DiffMap;
  occurredAt: string; // ISO
}

export interface RawCommentRow {
  id: string;
  nodeId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface NodeMeta {
  title: string;
  deleted: boolean;
}

export interface HistoryEntryData {
  type: 'HISTORY';
  id: string;
  nodeIdSnapshot: string;
  projectIdSnapshot: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  action: 'CREATE' | 'UPDATE' | 'MOVE' | 'DELETE' | 'RESTORE';
  diff: DiffMap;
  occurredAt: string;
  nodeTitle: string;
  nodeDeleted: boolean;
}

export interface CommentEntryData {
  type: 'COMMENT';
  id: string;
  nodeId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  nodeTitle: string;
  nodeDeleted: boolean;
}

export type ProjectHistoryEntryData = HistoryEntryData | CommentEntryData;

export interface AggregateResult {
  items: ProjectHistoryEntryData[];
  truncated: boolean;
}

export function selectHistoryByTopic(rows: RawHistoryRow[], topic: HistoryTopicValue): RawHistoryRow[] {
  switch (topic) {
    case 'COMMENTS':
      return [];
    case 'DELETED':
      return rows.filter((r) => r.action === 'DELETE');
    case 'PROGRESS_DOWN':
      return rows.filter((r) => r.action === 'UPDATE' && isProgressDown(r.diff));
    case 'PERIOD_CHANGE':
      return rows.filter((r) => r.action === 'UPDATE' && isPeriodChange(r.diff));
    case 'ALL':
    default:
      return rows;
  }
}

export interface BuildProjectHistoryInput {
  history: RawHistoryRow[];
  comments: RawCommentRow[];
  meta: Map<string, NodeMeta>; // key = nodeIdSnapshot(이력) / nodeId(댓글)
  topic: HistoryTopicValue;
  limit: number;
}

export function buildProjectHistory(input: BuildProjectHistoryInput): AggregateResult {
  const { history, comments, meta, topic, limit } = input;
  const items: ProjectHistoryEntryData[] = [];

  if (topic !== 'COMMENTS') {
    for (const r of selectHistoryByTopic(history, topic)) {
      const m = meta.get(r.nodeIdSnapshot);
      items.push({
        type: 'HISTORY',
        id: r.id,
        nodeIdSnapshot: r.nodeIdSnapshot,
        projectIdSnapshot: r.projectIdSnapshot,
        actorId: r.actorId,
        actorUsername: r.actorUsername,
        actorDisplayName: r.actorDisplayName,
        action: r.action,
        diff: r.diff,
        occurredAt: r.occurredAt,
        nodeTitle: m?.title ?? '(제목 없음)',
        nodeDeleted: m?.deleted ?? true,
      });
    }
  }

  if (topic === 'ALL' || topic === 'COMMENTS') {
    for (const c of comments) {
      const m = meta.get(c.nodeId);
      items.push({
        type: 'COMMENT',
        id: c.id,
        nodeId: c.nodeId,
        authorId: c.authorId,
        authorUsername: c.authorUsername,
        authorDisplayName: c.authorDisplayName,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        nodeTitle: m?.title ?? '(제목 없음)',
        nodeDeleted: m?.deleted ?? false,
      });
    }
  }

  // ISO 8601 문자열은 사전식 비교로 시간 순서가 유지된다. 역순(최신 먼저).
  items.sort((a, b) => tsOf(b).localeCompare(tsOf(a)));

  const truncated = items.length > limit;
  return { items: truncated ? items.slice(0, limit) : items, truncated };
}

function tsOf(e: ProjectHistoryEntryData): string {
  return e.type === 'HISTORY' ? e.occurredAt : e.createdAt;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/shared test`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/history-utils.ts packages/shared/src/history-utils.test.ts
git commit -m "feat(shared): 프로젝트 이력 주제 필터 + 병합/상한 집계 함수"
```

---

## Task 3: 공유 HTTP DTO (Zod) + 빌드

HTTP 경계에서 쓸 Zod 스키마(요청 쿼리·응답)를 `index.ts`에 추가하고, history-utils를 재노출한 뒤 shared를 빌드한다.

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/history-utils.test.ts` (쿼리 검증 테스트 추가)

**Interfaces:**
- Consumes: Task 2의 `HISTORY_TOPICS`, `HISTORY_RANGES`. 기존 `IsoDate`, `NodeHistoryItem`, `NodeCommentItem`.
- Produces:
  - `HistoryTopic`/`HistoryRange` (Zod enum + 타입)
  - `ProjectHistoryQuery` (Zod, 타입) — `{ topic; range; from?; to? }`, `custom`이면 from/to 필수 + `from <= to`
  - `ProjectHistoryEntry`/`ProjectHistoryResponse` (Zod, 타입)
  - history-utils 전체 재노출(`export * from './history-utils'`)

- [ ] **Step 1: 실패하는 테스트 추가**

`packages/shared/src/history-utils.test.ts` 하단에 추가. import 최상단에 `import { ProjectHistoryQuery } from './index';` 한 줄을 더한다.

```ts
import { ProjectHistoryQuery } from './index';

describe('ProjectHistoryQuery', () => {
  it('빈 입력이면 기본값 topic=ALL, range=1m', () => {
    const parsed = ProjectHistoryQuery.parse({});
    expect(parsed.topic).toBe('ALL');
    expect(parsed.range).toBe('1m');
  });
  it('custom 인데 from/to 없으면 실패', () => {
    expect(ProjectHistoryQuery.safeParse({ range: 'custom' }).success).toBe(false);
  });
  it('custom + from > to 이면 실패', () => {
    expect(
      ProjectHistoryQuery.safeParse({ range: 'custom', from: '2026-07-10', to: '2026-07-01' }).success,
    ).toBe(false);
  });
  it('custom + 올바른 from/to 는 성공', () => {
    const r = ProjectHistoryQuery.safeParse({ range: 'custom', from: '2026-07-01', to: '2026-07-10' });
    expect(r.success).toBe(true);
  });
  it('알 수 없는 topic 은 실패', () => {
    expect(ProjectHistoryQuery.safeParse({ topic: 'NOPE' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm -F @sam/shared test`
Expected: FAIL — `./index`에 `ProjectHistoryQuery` 없음.

- [ ] **Step 3: index.ts에 DTO 추가**

`packages/shared/src/index.ts` 최하단에 추가한다. (기존 `IsoDate`, `NodeHistoryItem`, `NodeCommentItem`는 이미 정의되어 있으므로 그대로 참조한다.)

```ts
// ─── 프로젝트 이력 조회 ─────────────────────────────────────────────────────
import {
  HISTORY_TOPICS,
  HISTORY_RANGES,
} from './history-utils';

// history-utils 의 순수 함수·데이터 타입을 그대로 재노출 (백엔드·프론트 공용)
export * from './history-utils';

export const HistoryTopic = z.enum(HISTORY_TOPICS);
export type HistoryTopic = z.infer<typeof HistoryTopic>;

export const HistoryRange = z.enum(HISTORY_RANGES);
export type HistoryRange = z.infer<typeof HistoryRange>;

export const ProjectHistoryQuery = z
  .object({
    topic: HistoryTopic.default('ALL'),
    range: HistoryRange.default('1m'),
    from: IsoDate.optional(), // range='custom' 일 때만
    to: IsoDate.optional(),
  })
  .refine((v) => v.range !== 'custom' || (!!v.from && !!v.to), {
    message: 'custom 범위는 from/to 가 필요합니다',
    path: ['from'],
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from 은 to 보다 작거나 같아야 합니다',
    path: ['to'],
  });
export type ProjectHistoryQuery = z.infer<typeof ProjectHistoryQuery>;

export const ProjectHistoryEntry = z.discriminatedUnion('type', [
  NodeHistoryItem.extend({
    type: z.literal('HISTORY'),
    nodeTitle: z.string(),
    nodeDeleted: z.boolean(),
  }),
  NodeCommentItem.extend({
    type: z.literal('COMMENT'),
    nodeTitle: z.string(),
    nodeDeleted: z.boolean(),
  }),
]);
export type ProjectHistoryEntry = z.infer<typeof ProjectHistoryEntry>;

export const ProjectHistoryResponse = z.object({
  items: z.array(ProjectHistoryEntry),
  truncated: z.boolean(),
});
export type ProjectHistoryResponse = z.infer<typeof ProjectHistoryResponse>;
```

> 주의: `import { z } from 'zod'` 는 파일 상단에 이미 있다. 위 `import { ... } from './history-utils'` 는 상단 import 블록으로 올려도 되고, 이처럼 해당 섹션 바로 위에 두어도 된다(번들러가 동일하게 해석).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/shared test`
Expected: PASS.

- [ ] **Step 5: shared 빌드 (이후 태스크가 dist를 참조)**

Run: `pnpm -F @sam/shared build`
Expected: 에러 없이 `packages/shared/dist` 갱신.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/index.ts packages/shared/src/history-utils.test.ts
git commit -m "feat(shared): 프로젝트 이력 조회 요청/응답 DTO 추가"
```

---

## Task 4: 백엔드 엔드포인트 (`GET /projects/:id/history`)

Prisma로 기간 창 내 이력·댓글을 읽고, 노드 제목/삭제상태를 해석한 뒤 shared 집계에 위임하는 서비스와 컨트롤러를 만들고 모듈에 등록한다.

**Files:**
- Create: `apps/api/src/nodes/project-history.service.ts`
- Create: `apps/api/src/nodes/project-history.controller.ts`
- Modify: `apps/api/src/nodes/nodes.module.ts`

**Interfaces:**
- Consumes: `@sam/shared`의 `buildProjectHistory`, `ProjectHistoryQuery`, `ProjectHistoryResponse`, `RawHistoryRow`, `RawCommentRow`, `NodeMeta`, `HistoryTopicValue`. `PrismaService`. `ZodValidationPipe`, `OriginGuard`, `AuthenticatedRequest`.
- Produces: `ProjectHistoryService.forProject(projectId, query, ctx): Promise<ProjectHistoryResponse>`, 라우트 `GET projects/:id/history`.

- [ ] **Step 1: 서비스 작성**

`apps/api/src/nodes/project-history.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildProjectHistory,
  type HistoryTopicValue,
  type NodeMeta,
  type ProjectHistoryQuery,
  type ProjectHistoryResponse,
  type RawCommentRow,
  type RawHistoryRow,
} from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';

interface ActorContext {
  actorId: string;
  globalRole: 'ADMIN' | 'USER';
  adminMode: boolean;
}

const RESULT_LIMIT = 500;

@Injectable()
export class ProjectHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 프로젝트 단위 이력 조회. 삭제된 노드의 이력도 projectIdSnapshot 으로 포함한다.
   * 권한: 그 프로젝트 멤버 OR ADMIN+adminMode.
   */
  async forProject(
    projectId: string,
    q: ProjectHistoryQuery,
    ctx: ActorContext,
  ): Promise<ProjectHistoryResponse> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });
    await this.assertReadAccess(projectId, ctx);

    const { from, to } = resolveWindow(q);

    // 이력: 삭제된 노드 포함(projectIdSnapshot 기준). COMMENTS 주제면 불필요.
    const historyRaw =
      q.topic === 'COMMENTS'
        ? []
        : await this.prisma.nodeHistory.findMany({
            where: { projectIdSnapshot: projectId, occurredAt: { gte: from, lte: to } },
            include: { actor: { select: { username: true, displayName: true } } },
            orderBy: { occurredAt: 'desc' },
          });

    // 댓글: 살아있는 노드 + 미삭제. ALL/COMMENTS 주제에서만 필요.
    const commentRaw =
      q.topic === 'ALL' || q.topic === 'COMMENTS'
        ? await this.prisma.nodeComment.findMany({
            where: { deletedAt: null, node: { projectId }, createdAt: { gte: from, lte: to } },
            include: { author: { select: { username: true, displayName: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    const history: RawHistoryRow[] = historyRaw.map((r) => ({
      id: r.id,
      nodeIdSnapshot: r.nodeIdSnapshot,
      projectIdSnapshot: r.projectIdSnapshot,
      actorId: r.actorId,
      actorUsername: r.actor.username,
      actorDisplayName: r.actor.displayName,
      action: r.action as RawHistoryRow['action'],
      diff: parseDiff(r.diffJson),
      occurredAt: r.occurredAt.toISOString(),
    }));

    const comments: RawCommentRow[] = commentRaw.map((c) => ({
      id: c.id,
      nodeId: c.nodeId,
      authorId: c.authorId,
      authorUsername: c.author.username,
      authorDisplayName: c.author.displayName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    const meta = await this.resolveNodeMeta(history, comments);

    return buildProjectHistory({
      history,
      comments,
      meta,
      topic: q.topic as HistoryTopicValue,
      limit: RESULT_LIMIT,
    });
  }

  /** 결과에 등장하는 노드들의 제목/삭제상태 map 을 만든다. */
  private async resolveNodeMeta(
    history: RawHistoryRow[],
    comments: RawCommentRow[],
  ): Promise<Map<string, NodeMeta>> {
    const ids = new Set<string>();
    history.forEach((h) => ids.add(h.nodeIdSnapshot));
    comments.forEach((c) => ids.add(c.nodeId));
    const idList = [...ids];
    const meta = new Map<string, NodeMeta>();
    if (idList.length === 0) return meta;

    const live = await this.prisma.scheduleNode.findMany({
      where: { id: { in: idList } },
      select: { id: true, title: true },
    });
    const liveIds = new Set<string>();
    for (const n of live) {
      meta.set(n.id, { title: n.title, deleted: false });
      liveIds.add(n.id);
    }

    const deadIds = idList.filter((id) => !liveIds.has(id));
    if (deadIds.length > 0) {
      // 삭제된 노드의 제목은 DELETE 이력의 diff.title.from 에서 복원.
      const delRows = await this.prisma.nodeHistory.findMany({
        where: { nodeIdSnapshot: { in: deadIds }, action: 'DELETE' },
        select: { nodeIdSnapshot: true, diffJson: true },
      });
      const titleByDead = new Map<string, string>();
      for (const d of delRows) {
        const t = titleFromDiff(parseDiff(d.diffJson));
        if (t && !titleByDead.has(d.nodeIdSnapshot)) titleByDead.set(d.nodeIdSnapshot, t);
      }
      for (const id of deadIds) {
        meta.set(id, { title: titleByDead.get(id) ?? '(삭제된 일정)', deleted: true });
      }
    }
    return meta;
  }

  private async assertReadAccess(projectId: string, ctx: ActorContext): Promise<void> {
    if (ctx.globalRole === 'ADMIN' && ctx.adminMode) return;
    const m = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: ctx.actorId } },
      select: { role: true },
    });
    if (!m) throw new ForbiddenException({ error: 'NOT_A_MEMBER' });
  }
}

/** range 를 실제 [from, to] Date 창으로 바꾼다. */
function resolveWindow(q: ProjectHistoryQuery): { from: Date; to: Date } {
  const now = new Date();
  if (q.range === 'custom' && q.from && q.to) {
    return {
      from: new Date(`${q.from}T00:00:00.000`),
      to: new Date(`${q.to}T23:59:59.999`),
    };
  }
  const days = q.range === '1w' ? 7 : 30;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

function parseDiff(json: string): Record<string, unknown> {
  try {
    const p: unknown = JSON.parse(json);
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      return p as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function titleFromDiff(diff: Record<string, unknown>): string | null {
  const t = diff.title;
  if (t && typeof t === 'object' && 'from' in t) {
    const from = (t as { from: unknown }).from;
    if (typeof from === 'string') return from;
  }
  return null;
}
```

- [ ] **Step 2: 컨트롤러 작성**

`apps/api/src/nodes/project-history.controller.ts`:

```ts
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProjectHistoryQuery, type ProjectHistoryResponse } from '@sam/shared';
import { OriginGuard } from '../common/origin.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type AuthenticatedRequest } from '../common/request-context';
import { ProjectHistoryService } from './project-history.service';

@Controller()
@UseGuards(OriginGuard)
export class ProjectHistoryController {
  constructor(private readonly service: ProjectHistoryService) {}

  @Get('projects/:id/history')
  forProject(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ProjectHistoryQuery)) query: ProjectHistoryQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectHistoryResponse> {
    return this.service.forProject(id, query, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
    });
  }
}
```

- [ ] **Step 3: 모듈에 등록**

`apps/api/src/nodes/nodes.module.ts`를 아래로 교체(새 import 2줄 + controllers/providers 배열에 추가):

```ts
import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { ProjectHistoryController } from './project-history.controller';
import { ProjectHistoryService } from './project-history.service';
import { AutocompleteModule } from '../autocomplete/autocomplete.module';

@Module({
  imports: [AutocompleteModule],
  controllers: [
    NodesController,
    CommentsController,
    HistoryController,
    ProjectHistoryController,
  ],
  providers: [NodesService, CommentsService, HistoryService, ProjectHistoryService],
  exports: [NodesService],
})
export class NodesModule {}
```

- [ ] **Step 4: 타입 검사**

Run: `pnpm -F @sam/api typecheck`
Expected: 에러 없음. (실패 시 `@sam/shared` dist가 최신인지 확인 — 필요하면 `pnpm -F @sam/shared build` 후 재시도.)

- [ ] **Step 5: 수동 확인 (선택, 개발 서버가 떠 있을 때)**

로그인 세션 쿠키가 있는 브라우저/HTTP 도구로:
```
GET http://localhost:5173/api/v1/projects/<프로젝트ID>/history?topic=ALL&range=1m
```
Expected: `{ "items": [...], "truncated": false }` 형태. 비멤버로 호출 시 403 `NOT_A_MEMBER`.

- [ ] **Step 6: 커밋**

```bash
git add apps/api/src/nodes/project-history.service.ts apps/api/src/nodes/project-history.controller.ts apps/api/src/nodes/nodes.module.ts
git commit -m "feat(api): 프로젝트 단위 이력 조회 엔드포인트 추가"
```

---

## Task 5: 프론트 렌더 공용 조각 (아이콘/색/짧은 라벨)

종류별 아이콘·색 map, 짧은 라벨 문자열 함수, 시각 포맷을 한 모듈에 모으고 라벨 함수를 단위 테스트한다.

**Files:**
- Create: `apps/web/src/lib/historyView.tsx`
- Test: `apps/web/src/lib/historyView.test.ts`

**Interfaces:**
- Consumes: `@sam/shared`의 `classifyChange`, `getProgressChange`, `ChangeKind`.
- Produces:
  - `KIND_STYLE: Record<ChangeKind, { icon: string; strip: string; text: string }>`
  - `historyLabelText(action: string, diff: Record<string, unknown>): string`
  - `formatDateTime(iso: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/historyView.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { historyLabelText } from './historyView';

describe('historyLabelText', () => {
  it('진행률 내림', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 80, to: 50 } })).toBe('진행률 80% → 50%');
  });
  it('진행률 올림', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 50, to: 80 } })).toBe('진행률 50% → 80%');
  });
  it('진행률 100% 완료', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 90, to: 100 } })).toBe('진행률 100%');
  });
  it('기간 변경(endAt)', () => {
    expect(historyLabelText('UPDATE', { endAt: { from: '2026-01-31', to: '2026-02-15' } })).toBe(
      '기간 2026-01-31 → 2026-02-15',
    );
  });
  it('제목 변경', () => {
    expect(historyLabelText('UPDATE', { title: { from: '구설계', to: '신설계' } })).toBe(
      '제목 "구설계" → "신설계"',
    );
  });
  it('생성/삭제/이동/복구', () => {
    expect(historyLabelText('CREATE', {})).toBe('생성');
    expect(historyLabelText('DELETE', {})).toBe('삭제');
    expect(historyLabelText('MOVE', {})).toBe('위치 이동');
    expect(historyLabelText('RESTORE', {})).toBe('복구');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm -F @sam/web test historyView`
Expected: FAIL — `historyView` 모듈 없음.

- [ ] **Step 3: 구현 작성**

`apps/web/src/lib/historyView.tsx`:

```tsx
import { classifyChange, getProgressChange, type ChangeKind } from '@sam/shared';

export interface KindStyle {
  icon: string;
  strip: string; // 왼쪽 색 띠 (배경)
  text: string; // 아이콘·숫자 글자색
}

// 변경 종류별 아이콘/색 (스펙 §7 표). COMMENT 는 페이지에서 별도 처리.
export const KIND_STYLE: Record<ChangeKind, KindStyle> = {
  PROGRESS_UP: { icon: '↗', strip: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  PROGRESS_DOWN: { icon: '↘', strip: 'bg-rose-400', text: 'text-rose-600 dark:text-rose-400' },
  PROGRESS_DONE: { icon: '✓', strip: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  PROGRESS_SET: { icon: '→', strip: 'bg-sky-400', text: 'text-sky-600 dark:text-sky-400' },
  PERIOD: { icon: '📅', strip: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  TITLE: { icon: '✏', strip: 'bg-slate-300', text: 'text-slate-600 dark:text-slate-300' },
  CREATE: { icon: '＋', strip: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  MOVE: { icon: '↳', strip: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  DELETE: { icon: '🗑', strip: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  RESTORE: { icon: '↺', strip: 'bg-violet-400', text: 'text-violet-600 dark:text-violet-400' },
  OTHER: { icon: '•', strip: 'bg-slate-300', text: 'text-slate-600 dark:text-slate-300' },
};

/** 짧은 라벨 문자열 (예: "진행률 80% → 50%"). 순수 함수 — 테스트 대상. */
export function historyLabelText(action: string, diff: Record<string, unknown>): string {
  const kind = classifyChange(action, diff);
  switch (kind) {
    case 'PROGRESS_UP':
    case 'PROGRESS_DOWN':
    case 'PROGRESS_SET': {
      const p = getProgressChange(diff);
      return p ? `진행률 ${p.from}% → ${p.to}%` : '진행률 변경';
    }
    case 'PROGRESS_DONE': {
      const p = getProgressChange(diff);
      return p ? `진행률 ${p.to}%` : '진행률 완료';
    }
    case 'PERIOD':
      return `기간 ${periodText(diff)}`;
    case 'TITLE':
      return `제목 ${pairText(diff, 'title', true)}`;
    case 'CREATE':
      return '생성';
    case 'MOVE':
      return '위치 이동';
    case 'DELETE':
      return '삭제';
    case 'RESTORE':
      return '복구';
    default:
      return '수정';
  }
}

function field(diff: Record<string, unknown>, key: string): { from: unknown; to: unknown } | null {
  const v = diff[key];
  if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
    return v as { from: unknown; to: unknown };
  }
  return null;
}

function short(v: unknown): string {
  return v === null || v === undefined || v === '' ? '없음' : String(v);
}

function pairText(diff: Record<string, unknown>, key: string, quote = false): string {
  const f = field(diff, key);
  if (!f) return '변경';
  const from = quote ? `"${short(f.from)}"` : short(f.from);
  const to = quote ? `"${short(f.to)}"` : short(f.to);
  return `${from} → ${to}`;
}

function periodText(diff: Record<string, unknown>): string {
  if (field(diff, 'endAt')) return pairText(diff, 'endAt');
  if (field(diff, 'startAt')) return pairText(diff, 'startAt');
  return '변경';
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F @sam/web test historyView`
Expected: PASS. (실패 시 `@sam/shared` dist 최신 여부 확인 — Task 3 Step 5의 build가 됐어야 함.)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/historyView.tsx apps/web/src/lib/historyView.test.ts
git commit -m "feat(web): 이력 렌더 공용 조각(아이콘/색/짧은 라벨) 추가"
```

---

## Task 6: 이력 조회 페이지 + 훅 + 라우트/링크

조회 훅과 페이지를 만들고, 라우트와 프로젝트 헤더 링크를 연결해 실제로 도달 가능한 화면을 완성한다.

**Files:**
- Create: `apps/web/src/lib/projectHistory.ts`
- Create: `apps/web/src/pages/ProjectHistoryPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/ProjectDetailPage.tsx`

**Interfaces:**
- Consumes: `useProjectHistory` (신규), `@sam/shared`의 `HistoryTopic`/`HistoryRange`/`ProjectHistoryEntry`/`ProjectHistoryQuery`/`classifyChange`, `historyView`의 `KIND_STYLE`/`historyLabelText`/`formatDateTime`, `api`, `apiErrorMessage`.
- Produces: 페이지 라우트 `/projects/:id/history`, 헤더 진입 링크.

- [ ] **Step 1: 조회 훅 작성**

`apps/web/src/lib/projectHistory.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { ProjectHistoryQuery, ProjectHistoryResponse } from '@sam/shared';
import { api } from './api';

export const projectHistoryKey = (projectId: string, q: ProjectHistoryQuery) =>
  ['projects', projectId, 'history', q] as const;

export function useProjectHistory(projectId: string | undefined, q: ProjectHistoryQuery) {
  return useQuery<ProjectHistoryResponse>({
    queryKey: projectId ? projectHistoryKey(projectId, q) : ['projects', '__none__', 'history'],
    queryFn: () => {
      const params = new URLSearchParams({ topic: q.topic, range: q.range });
      if (q.range === 'custom' && q.from && q.to) {
        params.set('from', q.from);
        params.set('to', q.to);
      }
      return api.get<ProjectHistoryResponse>(`/projects/${projectId}/history?${params.toString()}`);
    },
    enabled: !!projectId,
  });
}
```

- [ ] **Step 2: 페이지 작성**

`apps/web/src/pages/ProjectHistoryPage.tsx`:

```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  classifyChange,
  type HistoryRange,
  type HistoryTopic,
  type ProjectHistoryEntry,
  type ProjectHistoryQuery,
} from '@sam/shared';
import { useProjectHistory } from '../lib/projectHistory';
import { apiErrorMessage } from '../lib/errors';
import { KIND_STYLE, historyLabelText, formatDateTime } from '../lib/historyView';

const TOPICS: { value: HistoryTopic; label: string }[] = [
  { value: 'ALL', label: '모든 이력' },
  { value: 'PROGRESS_DOWN', label: '진행률 낮춤' },
  { value: 'DELETED', label: '삭제됨' },
  { value: 'PERIOD_CHANGE', label: '기간 변경' },
  { value: 'COMMENTS', label: '댓글' },
];

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '1w', label: '지난 1주' },
  { value: '1m', label: '지난 1달' },
  { value: 'custom', label: '직접 범위' },
];

export default function ProjectHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [topic, setTopic] = useState<HistoryTopic>('ALL');
  const [range, setRange] = useState<HistoryRange>('1m');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query: ProjectHistoryQuery =
    range === 'custom' ? { topic, range, from, to } : { topic, range };
  const ready = range !== 'custom' || (!!from && !!to && from <= to);
  const q = useProjectHistory(ready ? id : undefined, query);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">이력 조회</h1>
        <Link to={`/projects/${id}`} className="text-sm text-sky-600 hover:underline">
          ← 프로젝트로
        </Link>
      </div>

      {/* 기간 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.value} type="button" onClick={() => setRange(r.value)} className={chip(range === r.value)}>
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <span className="flex items-center gap-1 text-sm">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE_INPUT} />
            <span className="text-slate-400">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE_INPUT} />
          </span>
        )}
      </div>

      {/* 주제 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTopic(t.value)} className={chip(topic === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {range === 'custom' && !ready && (
        <p className="text-xs text-slate-500">시작일과 종료일을 올바르게 선택하세요.</p>
      )}
      {q.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {q.isError && <p className="text-sm text-rose-600">{apiErrorMessage(q.error)}</p>}

      {q.data && (
        <>
          {q.data.truncated && (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              최근 500건만 표시했습니다. 기간을 좁혀 보세요.
            </p>
          )}
          {q.data.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">이 기간에 해당하는 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {q.data.items.map((item) => (
                <Row key={`${item.type}-${item.id}`} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Row({ item }: { item: ProjectHistoryEntry }) {
  let icon: string;
  let strip: string;
  let text: string;
  let label: string;
  let who: string;
  let when: string;

  if (item.type === 'COMMENT') {
    icon = '💬';
    strip = 'bg-sky-400';
    text = 'text-sky-600 dark:text-sky-400';
    label = item.body;
    who = item.authorDisplayName;
    when = item.createdAt;
  } else {
    const s = KIND_STYLE[classifyChange(item.action, item.diff)];
    icon = s.icon;
    strip = s.strip;
    text = s.text;
    label = historyLabelText(item.action, item.diff);
    who = item.actorDisplayName;
    when = item.occurredAt;
  }

  return (
    <li className="flex items-stretch overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
      <span className={`w-1 shrink-0 ${strip}`} aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
        <span className={`shrink-0 ${text}`}>{icon}</span>
        <span className="truncate text-slate-700 dark:text-slate-200">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
          <span className={item.nodeDeleted ? 'text-slate-400 line-through' : 'text-slate-500'}>
            "{item.nodeTitle}"
          </span>
          {item.nodeDeleted && (
            <span className="rounded border border-slate-300 px-1 text-[10px] text-slate-500 dark:border-slate-700">
              삭제됨
            </span>
          )}
          <span>
            · {who} · {formatDateTime(when)}
          </span>
        </span>
      </div>
    </li>
  );
}

const CHIP_BASE = 'rounded-full border px-3 py-1 text-xs transition-colors';
function chip(active: boolean): string {
  return active
    ? `${CHIP_BASE} border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300`
    : `${CHIP_BASE} border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`;
}
const DATE_INPUT = 'rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900';
```

- [ ] **Step 3: 라우트 추가**

`apps/web/src/App.tsx` 상단 import에 페이지를 추가한다(기존 `import ProjectDetailPage ...` 근처):

```tsx
import ProjectHistoryPage from './pages/ProjectHistoryPage';
```

그리고 `/projects/:id/members` 라우트 블록(198~204줄) 바로 아래에 라우트를 추가한다:

```tsx
          <Route
            path="/projects/:id/history"
            element={
              <RequireAuth>
                <ProjectHistoryPage />
              </RequireAuth>
            }
          />
```

- [ ] **Step 4: 프로젝트 헤더에 "이력" 링크 추가**

`apps/web/src/pages/ProjectDetailPage.tsx`에서 멤버 링크(`<Link to={.../members}>...</Link>`, 1044~1052줄)가 끝나는 `</Link>` 바로 뒤에 이력 링크를 추가한다:

```tsx
          <Link
            to={`/projects/${project.id}/history`}
            className="p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="이력 조회 (진행률/삭제/댓글/기간 변경)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>
```

- [ ] **Step 5: 타입 검사 + 테스트**

Run: `pnpm -F @sam/web typecheck && pnpm -F @sam/web test`
Expected: 타입 에러 없음, 기존 + historyView 테스트 통과.

- [ ] **Step 6: 화면 확인 (개발 서버)**

개발 서버에서 프로젝트 상세 → 헤더의 "이력" 아이콘 클릭 → `/projects/:id/history` 도달. 기간·주제 칩을 바꾸면 목록이 갱신되는지, 삭제된 노드가 취소선 + "삭제됨"으로 보이는지, 결과 없을 때 안내 문구가 나오는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/lib/projectHistory.ts apps/web/src/pages/ProjectHistoryPage.tsx apps/web/src/App.tsx apps/web/src/pages/ProjectDetailPage.tsx
git commit -m "feat(web): 프로젝트 이력 조회 페이지 + 라우트/헤더 링크 추가"
```

---

## Task 7: ActivityFeedPanel을 공용 짧은 라벨로 정리

스펙 §7에 따라, 기존 노드별 피드의 장황한 문장("… 님이 진척율을 내렸습니다")을 공용 짧은 라벨로 바꾸고 시각 포맷을 공용 함수로 통일한다. **이 태스크로 기존 노드 상세의 이력 표시 문구가 짧은 라벨로 바뀐다(의도된 변경).**

**Files:**
- Modify: `apps/web/src/components/ActivityFeedPanel.tsx`

**Interfaces:**
- Consumes: `historyView`의 `historyLabelText`, `formatDateTime`.
- Produces: 없음(내부 표시 정리).

- [ ] **Step 1: import 추가**

`apps/web/src/components/ActivityFeedPanel.tsx` 상단 import 블록에 추가:

```tsx
import { historyLabelText, formatDateTime as formatDateTimeShared } from '../lib/historyView';
```

- [ ] **Step 2: 이력 요약을 짧은 라벨로 교체**

HISTORY 분기에서 요약을 그리는 줄(현재 `{renderHistorySummary(h.action, h.diff, h.actorDisplayName)}`, 110줄 부근)을 아래로 바꾼다:

```tsx
                      {historyLabelText(h.action, h.diff)}
```

- [ ] **Step 3: 로컬 renderHistorySummary 제거**

더 이상 쓰이지 않는 로컬 함수 `renderHistorySummary`(161~220줄) 전체를 삭제한다. (`ActionBadge`, `DiffTooltip`는 계속 쓰이므로 남긴다.)

- [ ] **Step 4: 로컬 formatDateTime을 공용으로 교체**

파일 하단의 로컬 `function formatDateTime(iso: string)`(256줄 부근) 정의를 삭제하고, 파일 안에서 `formatDateTime(` 호출을 모두 `formatDateTimeShared(`로 바꾼다(댓글의 `formatDateTime(c.createdAt)`, 이력의 `formatDateTime(h.occurredAt)` 두 곳).

- [ ] **Step 5: 타입 검사 + 테스트**

Run: `pnpm -F @sam/web typecheck && pnpm -F @sam/web test`
Expected: 타입 에러 없음(삭제한 함수 참조 잔여 없음), 테스트 통과.

- [ ] **Step 6: 화면 확인 (개발 서버)**

노드 하나를 열어 "통합 작업 히스토리 & 피드"에서 진행률 변경이 "진행률 80% → 50%"처럼 짧게 나오는지, 날짜가 정상 표시되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/ActivityFeedPanel.tsx
git commit -m "refactor(web): 노드 피드 이력 표시를 공용 짧은 라벨로 통일"
```

---

## 최종 검증

- [ ] **전체 타입 검사**

Run: `pnpm -F @sam/shared build && pnpm -r typecheck`
Expected: 모든 워크스페이스 타입 에러 없음.

- [ ] **전체 테스트**

Run: `pnpm -F @sam/shared test && pnpm -F @sam/web test`
Expected: shared/web 테스트 모두 통과.

---

## Self-Review 결과 (계획 작성자 확인)

- **스펙 커버리지**: 5개 주제(ALL/PROGRESS_DOWN/DELETED/PERIOD_CHANGE/COMMENTS) → Task 2 `selectHistoryByTopic` + Task 4 서비스. 기간 3종 → Task 3 DTO + Task 4 `resolveWindow`. 삭제 노드 포함·상태표시 → Task 2 `buildProjectHistory`(nodeDeleted) + Task 4 `resolveNodeMeta` + Task 6 Row(취소선/배지). 짧은 라벨·아이콘·왼쪽 색 띠 → Task 5 + Task 6. (B) 병합 → Task 2 ALL 병합 + Task 6. 권한 → Task 4 `assertReadAccess`. 상한 500·truncated → Task 2 + Task 6. 공유 판정 함수 → Task 1/2. 바로 가기 v1 제외 → 계획에 없음(의도적). DB 변경 없음 → Global Constraints 명시.
- **플레이스홀더 스캔**: TBD/TODO 없음. 모든 코드 단계에 완전한 코드 포함.
- **타입 일관성**: `RawHistoryRow`/`RawCommentRow`/`NodeMeta`/`ProjectHistoryEntryData`(Task 2) ↔ 서비스 매핑(Task 4) ↔ Zod `ProjectHistoryEntry`/`ProjectHistoryResponse`(Task 3) 필드·타입 일치 확인. `HistoryTopicValue`(shared) = `ProjectHistoryQuery.topic` 열거값 일치. `KIND_STYLE` 키 = `ChangeKind` 전체.
