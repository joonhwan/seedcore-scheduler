# 프로젝트 복제 (Project Clone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 프로젝트의 일정 트리를 그대로 물려받고 날짜만 새 기간에 맞춰 옮긴 새 프로젝트를 한 번에 만드는 기능을 추가한다.

**Architecture:** 계산 로직을 두 개의 순수 함수 모듈로 분리한다. 날짜 재매핑은 `packages/shared` 에 둬서 web 의 미리보기가 API 의 실제 계산과 같은 코드를 쓰게 하고, 트리 재구성(`oldId → newId` 맵으로 `parentId` 다시 엮기)은 `apps/api` 에 둔다. 서비스는 이 둘을 조립해 하나의 트랜잭션으로 삽입만 한다. DB 스키마 변경은 없다.

**Tech Stack:** NestJS 10, Prisma 5.22, SQLite, Zod, React 18 + TanStack Query, vitest

**Spec:** `docs/superpowers/specs/2026-08-01-project-clone-design.md`

## Global Constraints

- `cd` 를 독립 실행하지 않는다. 모든 명령은 리포 루트에서 `pnpm -F <pkg> ...` 형태로 실행한다 (AGENTS.md §4.1).
- 기존 인라인 주석·docstring 을 임의로 삭제하지 않는다 (AGENTS.md §4.1).
- `class-validator` / `ValidationPipe` 를 쓰지 않는다. 모든 검증은 `packages/shared` 의 Zod 스키마 + `ZodValidationPipe` 로 한다 (AGENTS.md §4.2).
- **`@UsePipes(new ZodValidationPipe(...))` 를 쓰지 않는다.** `@UsePipes` 는 path param 에도 적용되어 `:id` 를 body 스키마로 검증하려 든다. 반드시 `@Body(new ZodValidationPipe(Dto))` 형태를 쓴다.
- 상태 변경 라우트에는 `@UseGuards(OriginGuard)` 가 붙어야 한다 (AGENTS.md §4.4). `ProjectsController` 는 클래스 레벨에 이미 붙어 있다.
- `ctx.adminMode === true` 인 상태의 데이터 수정은 `'ADMIN_OVERRIDE_EDIT'` 감사로그를 **추가로** 남긴다 (AGENTS.md §4.4).
- `tsconfig` 에 `exactOptionalPropertyTypes: true` 가 켜져 있다. optional 필드 타입은 `foo?: string | undefined` 로 명시한다 (AGENTS.md §4.3).
- 트리 최대 깊이는 5 (`depth` 0~4), `sortOrder` 는 1부터 시작하는 밀집 정렬 (AGENTS.md §4.6).
- GROUP 의 `startAt`/`endAt`/`progress` 는 DB 에서 비어 있고 자손 ITEM 에서 자동 계산된다. **복제 시 GROUP 의 날짜를 건드리지 않는다** (AGENTS.md §4.6).
- 날짜는 `YYYY-MM-DD` 문자열이다. `IsoDate` (`packages/shared/src/index.ts:18`) 로 검증한다.
- 코드 변경 후 `pnpm -r typecheck` 를 실행해 컴파일 에러가 없는지 확인한다 (AGENTS.md §4.1).
- `packages/shared` 를 수정하면 **`pnpm -F @sam/shared build` 를 먼저 돌려야** api/web 이 타입을 해석할 수 있다 (AGENTS.md §5.3). `tsconfig.base.json` 에 `paths` 가 없다.
- 로컬 서버가 떠 있으면 SQLite 가 잠긴다. 마이그레이션 명령은 이 계획에 없지만, 수동 검증 시 이 점을 유의한다 (AGENTS.md §5.1).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/shared/src/clone-dates.ts` (신규) | 날짜 재매핑 순수 함수. epoch-day 산술, span 탐색, 사상 계획 생성, 날짜쌍 사상 |
| `packages/shared/src/clone-dates.test.ts` (신규) | 위 모듈의 단위 테스트 |
| `packages/shared/src/index.ts` (수정) | `CloneProjectDto` / `CloneProjectResult` DTO, `AuditAction` 에 `PROJECT_CLONE` 추가, `clone-dates` 재수출 |
| `packages/shared/src/clone-dto.test.ts` (신규) | `CloneProjectDto` 의 모드별 `superRefine` 검증 테스트 |
| `apps/api/src/projects/clone-tree.ts` (신규) | 트리 재구성 순수 함수. `oldId → newId` 맵으로 `parentId` 재연결, `progress` 0 초기화 |
| `apps/api/src/projects/clone-tree.test.ts` (신규) | 위 모듈의 단위 테스트 |
| `apps/api/src/projects/projects.service.ts` (수정) | `clone()` 메서드 추가. 위 두 순수 함수를 조립하고 트랜잭션 삽입 |
| `apps/api/src/projects/projects.controller.ts` (수정) | `POST admin/projects/:id/clone` 라우트 추가 |
| `apps/web/src/lib/projects.ts` (수정) | `useCloneProject` 훅 추가 |
| `apps/web/src/pages/ProjectClonePage.tsx` (신규) | 복제 폼 페이지 — 이름/설명/일정 모드/멤버 승계 |
| `apps/web/src/App.tsx` (수정) | `/projects/:id/clone` 라우트 등록 |
| `apps/web/src/pages/ProjectsPage.tsx` (수정) | "관리" 열에 복제 버튼 추가 |

---

## Task 1: 날짜 재매핑 순수 함수 (`packages/shared`)

**Files:**
- Create: `packages/shared/src/clone-dates.ts`
- Test: `packages/shared/src/clone-dates.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type CloneDateMode = 'KEEP' | 'SHIFT' | 'FIT'`
  - `interface DatePair { startAt: string | null; endAt: string | null }`
  - `interface DateSpan { start: string; end: string }`
  - `type RemapPlan` — 판별 유니온 (`{mode:'KEEP'}` | `{mode:'SHIFT';deltaDays:number}` | `{mode:'FIT';srcStart:number;srcEnd:number;dstStart:number;dstEnd:number}`)
  - `function toEpochDay(date: string): number`
  - `function fromEpochDay(day: number): string`
  - `function findDateSpan(items: DatePair[]): DateSpan | null`
  - `function buildRemapPlan(span: DateSpan | null, input: { mode: CloneDateMode; newStartDate?: string | undefined; newEndDate?: string | undefined }): RemapPlan`
  - `function remapDatePair(pair: DatePair, plan: RemapPlan): DatePair`

- [ ] **Step 1: 테스트 파일을 작성한다 (실패하는 상태)**

`packages/shared/src/clone-dates.test.ts` 를 만든다. 기존 `packages/shared/src/history-utils.test.ts` 와 같은 자리·같은 스타일이다.

```ts
import { describe, expect, it } from 'vitest';
import {
  buildRemapPlan,
  findDateSpan,
  fromEpochDay,
  remapDatePair,
  toEpochDay,
} from './clone-dates';

describe('epoch-day 변환', () => {
  it('YYYY-MM-DD 를 왕복 변환해도 값이 유지된다', () => {
    for (const d of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });

  it('하루 차이는 1 이다', () => {
    expect(toEpochDay('2026-03-02') - toEpochDay('2026-03-01')).toBe(1);
  });

  it('2026 년은 윤년이 아니라 2 월이 28 일이다', () => {
    expect(toEpochDay('2026-03-01') - toEpochDay('2026-02-01')).toBe(28);
  });
});

describe('findDateSpan', () => {
  it('날짜가 하나도 없으면 null 이다', () => {
    expect(findDateSpan([{ startAt: null, endAt: null }])).toBeNull();
    expect(findDateSpan([])).toBeNull();
  });

  it('startAt 만 있는 항목에서도 span 을 만든다', () => {
    expect(findDateSpan([{ startAt: '2026-05-01', endAt: null }])).toEqual({
      start: '2026-05-01',
      end: '2026-05-01',
    });
  });

  it('여러 항목의 최소 시작일과 최대 종료일을 찾는다', () => {
    const span = findDateSpan([
      { startAt: '2026-03-10', endAt: '2026-03-20' },
      { startAt: '2026-01-05', endAt: '2026-02-01' },
      { startAt: null, endAt: '2026-06-30' },
    ]);
    expect(span).toEqual({ start: '2026-01-05', end: '2026-06-30' });
  });
});

describe('KEEP 모드', () => {
  it('날짜를 그대로 둔다', () => {
    const plan = buildRemapPlan({ start: '2026-01-05', end: '2026-06-30' }, { mode: 'KEEP' });
    expect(remapDatePair({ startAt: '2026-02-10', endAt: '2026-02-20' }, plan)).toEqual({
      startAt: '2026-02-10',
      endAt: '2026-02-20',
    });
  });

  it('span 이 null 이어도 계획을 만들 수 있다', () => {
    expect(buildRemapPlan(null, { mode: 'KEEP' })).toEqual({ mode: 'KEEP' });
  });
});

describe('SHIFT 모드 — 기간과 간격이 완전히 보존된다', () => {
  const span = { start: '2026-01-05', end: '2026-06-30' };
  // 2026-01-05 → 2026-03-05 는 59 일 (1월 잔여 26 + 2월 28 + 3월 5)
  const plan = buildRemapPlan(span, { mode: 'SHIFT', newStartDate: '2026-03-05' });

  it('delta 는 새 시작일과 원본 최소 시작일의 차이다', () => {
    expect(plan).toEqual({ mode: 'SHIFT', deltaDays: 59 });
  });

  it('모든 날짜가 같은 일수만큼 밀린다', () => {
    expect(remapDatePair({ startAt: '2026-02-10', endAt: '2026-02-20' }, plan)).toEqual({
      startAt: '2026-04-10',
      endAt: '2026-04-20',
    });
  });

  it('기간이 변하지 않는다', () => {
    const out = remapDatePair({ startAt: '2026-01-05', endAt: '2026-01-19' }, plan);
    expect(toEpochDay(out.endAt!) - toEpochDay(out.startAt!)).toBe(14);
  });

  it('원본 시작일은 정확히 새 시작일이 된다', () => {
    expect(remapDatePair({ startAt: '2026-01-05', endAt: null }, plan).startAt).toBe('2026-03-05');
  });

  it('과거로 미는 음수 delta 도 동작한다', () => {
    const back = buildRemapPlan(span, { mode: 'SHIFT', newStartDate: '2025-12-06' });
    expect(back).toEqual({ mode: 'SHIFT', deltaDays: -30 });
    expect(remapDatePair({ startAt: '2026-01-05', endAt: null }, back).startAt).toBe('2025-12-06');
  });
});

describe('FIT 모드 — 기간까지 비례해서 늘어난다', () => {
  // 원본 span 180 일 (2026-01-01 ~ 2026-06-30), 새 span 364 일 (2026-01-01 ~ 2026-12-31)
  const plan = buildRemapPlan(
    { start: '2026-01-01', end: '2026-06-30' },
    { mode: 'FIT', newStartDate: '2026-01-01', newEndDate: '2026-12-31' },
  );

  it('계획에 원본과 대상 span 이 epoch-day 로 담긴다', () => {
    expect(plan).toEqual({
      mode: 'FIT',
      srcStart: toEpochDay('2026-01-01'),
      srcEnd: toEpochDay('2026-06-30'),
      dstStart: toEpochDay('2026-01-01'),
      dstEnd: toEpochDay('2026-12-31'),
    });
  });

  it('14 일 작업이 약 2 배인 28 일이 된다', () => {
    // round(14 * 364 / 180) = round(28.31) = 28
    const out = remapDatePair({ startAt: '2026-01-01', endAt: '2026-01-15' }, plan);
    expect(out).toEqual({ startAt: '2026-01-01', endAt: '2026-01-29' });
  });

  it('원본 span 의 양 끝이 새 span 의 양 끝으로 정확히 간다', () => {
    expect(remapDatePair({ startAt: '2026-01-01', endAt: '2026-06-30' }, plan)).toEqual({
      startAt: '2026-01-01',
      endAt: '2026-12-31',
    });
  });

  it('중간 지점이 중간으로 간다', () => {
    // (2026-04-01 - 2026-01-01) = 90 일. round(90 * 364 / 180) = 182
    expect(remapDatePair({ startAt: '2026-04-01', endAt: null }, plan).startAt).toBe(
      fromEpochDay(toEpochDay('2026-01-01') + 182),
    );
  });

  it('범위를 좁히면 기간도 줄어든다', () => {
    // 원본 180 일 → 새 90 일. 20 일 작업은 round(20 * 90 / 180) = 10 일
    const shrink = buildRemapPlan(
      { start: '2026-01-01', end: '2026-06-30' },
      { mode: 'FIT', newStartDate: '2026-01-01', newEndDate: '2026-04-01' },
    );
    const out = remapDatePair({ startAt: '2026-01-01', endAt: '2026-01-21' }, shrink);
    expect(toEpochDay(out.endAt!) - toEpochDay(out.startAt!)).toBe(10);
  });
});

describe('FIT 엣지 케이스', () => {
  it('원본 span 이 0 일이면 0 으로 나누지 않고 모두 새 시작일로 간다', () => {
    const plan = buildRemapPlan(
      { start: '2026-01-10', end: '2026-01-10' },
      { mode: 'FIT', newStartDate: '2026-05-01', newEndDate: '2026-08-01' },
    );
    expect(remapDatePair({ startAt: '2026-01-10', endAt: '2026-01-10' }, plan)).toEqual({
      startAt: '2026-05-01',
      endAt: '2026-05-01',
    });
  });

  it('원본 span 을 벗어난 날짜는 새 범위로 clamp 된다', () => {
    const plan = buildRemapPlan(
      { start: '2026-01-01', end: '2026-01-11' },
      { mode: 'FIT', newStartDate: '2026-03-01', newEndDate: '2026-03-11' },
    );
    // 원본 span 밖(2026-02-01)은 위쪽 경계로 잘린다
    expect(remapDatePair({ startAt: '2026-02-01', endAt: null }, plan).startAt).toBe('2026-03-11');
    // 아래쪽도 마찬가지
    expect(remapDatePair({ startAt: '2025-12-01', endAt: null }, plan).startAt).toBe('2026-03-01');
  });
});

describe('날짜쌍 보정', () => {
  const plan = buildRemapPlan(
    { start: '2026-01-01', end: '2026-01-11' },
    { mode: 'FIT', newStartDate: '2026-03-01', newEndDate: '2026-03-03' },
  );

  it('사상 후 endAt 이 startAt 보다 앞서면 startAt 으로 맞춘다', () => {
    // clamp 로 뒤집힐 수 있는 조합을 만든다
    const out = remapDatePair({ startAt: '2026-01-11', endAt: '2026-01-01' }, plan);
    expect(out.endAt).toBe(out.startAt);
  });

  it('null 은 null 로 유지된다', () => {
    expect(remapDatePair({ startAt: null, endAt: null }, plan)).toEqual({
      startAt: null,
      endAt: null,
    });
    expect(remapDatePair({ startAt: null, endAt: '2026-01-05' }, plan).startAt).toBeNull();
  });
});

describe('buildRemapPlan 방어', () => {
  it('span 이 null 인데 SHIFT 면 NO_DATED_ITEMS 로 던진다', () => {
    expect(() => buildRemapPlan(null, { mode: 'SHIFT', newStartDate: '2026-01-01' })).toThrow(
      'NO_DATED_ITEMS',
    );
  });

  it('SHIFT 인데 newStartDate 가 없으면 던진다', () => {
    expect(() => buildRemapPlan({ start: '2026-01-01', end: '2026-02-01' }, { mode: 'SHIFT' })).toThrow(
      'NEW_START_DATE_REQUIRED',
    );
  });

  it('FIT 인데 newEndDate 가 없으면 던진다', () => {
    expect(() =>
      buildRemapPlan(
        { start: '2026-01-01', end: '2026-02-01' },
        { mode: 'FIT', newStartDate: '2026-03-01' },
      ),
    ).toThrow('NEW_END_DATE_REQUIRED');
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm -F @sam/shared test`

Expected: FAIL — `Failed to resolve import "./clone-dates"` (모듈이 아직 없다)

- [ ] **Step 3: 구현한다**

`packages/shared/src/clone-dates.ts` 를 만든다.

```ts
// 프로젝트 복제 시 일정 날짜를 새 기간으로 옮기는 순수 함수들.
//
// API 가 실제 복제에서 쓰는 계산과 web 이 화면에 보여주는 미리보기가 어긋나면 안 되므로
// shared 에 둔다. 날짜는 'YYYY-MM-DD' 문자열이라 UTC epoch-day 정수로 바꿔 산술한다
// (schema.prisma 의 start_at/end_at 이 DateTime 이 아니라 String 이므로 타임존 함정이 없다).

const MS_PER_DAY = 86_400_000;

export type CloneDateMode = 'KEEP' | 'SHIFT' | 'FIT';

export interface DatePair {
  startAt: string | null;
  endAt: string | null;
}

export interface DateSpan {
  start: string;
  end: string;
}

/**
 * 모드별 사상 계획. 한 번 만들어 두고 노드마다 remapDatePair 로 반복 적용한다.
 * FIT 의 네 값은 모두 epoch-day 정수다.
 */
export type RemapPlan =
  | { mode: 'KEEP' }
  | { mode: 'SHIFT'; deltaDays: number }
  | { mode: 'FIT'; srcStart: number; srcEnd: number; dstStart: number; dstEnd: number };

export function toEpochDay(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(day: number): string {
  const dt = new Date(day * MS_PER_DAY);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 원본 일정에서 [최소 시작일, 최대 종료일] 을 뽑는다. 날짜가 하나도 없으면 null.
 * 'YYYY-MM-DD' 는 사전순 비교가 시간순 비교와 일치하므로 문자열로 직접 비교한다.
 */
export function findDateSpan(items: DatePair[]): DateSpan | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const item of items) {
    for (const value of [item.startAt, item.endAt]) {
      if (!value) continue;
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
    }
  }
  if (min === null || max === null) return null;
  return { start: min, end: max };
}

/**
 * 호출자는 SHIFT/FIT 을 쓰기 전에 span 이 null 이 아님을 보장해야 한다.
 * 여기서 던지는 Error 는 방어용 backstop 이다 (API 는 400, web 은 옵션 비활성화로 미리 막는다).
 */
export function buildRemapPlan(
  span: DateSpan | null,
  input: {
    mode: CloneDateMode;
    newStartDate?: string | undefined;
    newEndDate?: string | undefined;
  },
): RemapPlan {
  if (input.mode === 'KEEP') return { mode: 'KEEP' };
  if (span === null) throw new Error('NO_DATED_ITEMS');
  if (!input.newStartDate) throw new Error('NEW_START_DATE_REQUIRED');

  if (input.mode === 'SHIFT') {
    return {
      mode: 'SHIFT',
      deltaDays: toEpochDay(input.newStartDate) - toEpochDay(span.start),
    };
  }

  if (!input.newEndDate) throw new Error('NEW_END_DATE_REQUIRED');
  return {
    mode: 'FIT',
    srcStart: toEpochDay(span.start),
    srcEnd: toEpochDay(span.end),
    dstStart: toEpochDay(input.newStartDate),
    dstEnd: toEpochDay(input.newEndDate),
  };
}

function remapOne(date: string, plan: RemapPlan): string {
  if (plan.mode === 'KEEP') return date;

  const day = toEpochDay(date);
  if (plan.mode === 'SHIFT') return fromEpochDay(day + plan.deltaDays);

  const srcLen = plan.srcEnd - plan.srcStart;
  const dstLen = plan.dstEnd - plan.dstStart;
  // 원본 전체가 하루면 비례 배분할 축이 없다. 0 으로 나누지 않고 새 시작일로 모은다.
  if (srcLen === 0) return fromEpochDay(plan.dstStart);

  const mapped = plan.dstStart + Math.round(((day - plan.srcStart) * dstLen) / srcLen);
  const lo = Math.min(plan.dstStart, plan.dstEnd);
  const hi = Math.max(plan.dstStart, plan.dstEnd);
  return fromEpochDay(Math.min(hi, Math.max(lo, mapped)));
}

/**
 * 한 일정의 날짜 한 쌍을 사상한다. 각 필드를 독립 사상하고, null 은 null 로 남긴다.
 * 반올림·clamp 때문에 endAt 이 startAt 보다 앞서면 startAt 으로 맞춘다.
 */
export function remapDatePair(pair: DatePair, plan: RemapPlan): DatePair {
  const startAt = pair.startAt === null ? null : remapOne(pair.startAt, plan);
  let endAt = pair.endAt === null ? null : remapOne(pair.endAt, plan);
  if (startAt !== null && endAt !== null && endAt < startAt) endAt = startAt;
  return { startAt, endAt };
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `pnpm -F @sam/shared test`

Expected: PASS — `clone-dates.test.ts` 의 모든 테스트가 통과하고, 기존 `history-utils.test.ts` 도 그대로 통과한다.

- [ ] **Step 5: 커밋한다**

```bash
git add packages/shared/src/clone-dates.ts packages/shared/src/clone-dates.test.ts
git commit -m "feat(shared): 프로젝트 복제용 날짜 재매핑 순수 함수

KEEP/SHIFT/FIT 세 모드. SHIFT 는 기간·간격을 완전히 보존하고
FIT 은 시작·종료를 각각 비례 사상해 기간까지 함께 늘리거나 줄인다.

날짜는 UTC epoch-day 정수로 바꿔 산술한다. 원본 span 이 0 일이면
0 으로 나누지 않고 새 시작일로 모으고, 결과는 새 범위로 clamp 한 뒤
endAt 이 startAt 보다 앞서면 startAt 으로 맞춘다."
```

---

## Task 2: 복제 DTO 와 감사 액션 (`packages/shared`)

**Files:**
- Modify: `packages/shared/src/index.ts` (`AuditAction` enum ~line 110-139, `ProjectDetail` 뒤 ~line 185, 파일 끝 재수출)
- Test: `packages/shared/src/clone-dto.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `CloneDateMode`, `clone-dates` 모듈 전체
- Produces:
  - `CloneProjectDto` — Zod 스키마 + 동명 타입. 필드: `name: string`, `description?: string | null`, `dateMode: 'KEEP'|'SHIFT'|'FIT'`, `newStartDate?: string`, `newEndDate?: string`, `managerUserIds: string[]`, `memberUserIds: string[]`
  - `CloneProjectResult` — Zod 스키마 + 동명 타입. 필드: `project: ProjectDetail`, `nodeCount: number`
  - `AuditAction` 에 `'PROJECT_CLONE'` 추가
  - `@sam/shared` 에서 `clone-dates` 의 모든 export 를 재수출

- [ ] **Step 1: 테스트 파일을 작성한다 (실패하는 상태)**

`packages/shared/src/clone-dto.test.ts` 를 만든다.

```ts
import { describe, expect, it } from 'vitest';
import { AuditAction, CloneProjectDto } from './index';

const base = {
  name: '2호기',
  managerUserIds: ['u1'],
};

describe('CloneProjectDto', () => {
  it('KEEP 모드는 날짜 입력 없이 통과한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'KEEP' });
    expect(r.success).toBe(true);
  });

  it('memberUserIds 는 생략하면 빈 배열이 된다', () => {
    const r = CloneProjectDto.parse({ ...base, dateMode: 'KEEP' });
    expect(r.memberUserIds).toEqual([]);
  });

  it('MANAGER 가 0 명이면 거부한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, managerUserIds: [], dateMode: 'KEEP' });
    expect(r.success).toBe(false);
  });

  it('SHIFT 는 newStartDate 가 있어야 한다', () => {
    expect(CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT' }).success).toBe(false);
    expect(
      CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT', newStartDate: '2026-03-01' }).success,
    ).toBe(true);
  });

  it('SHIFT 는 newEndDate 를 요구하지 않는다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'SHIFT',
      newStartDate: '2026-03-01',
    });
    expect(r.success).toBe(true);
  });

  it('FIT 은 newStartDate 와 newEndDate 둘 다 있어야 한다', () => {
    expect(
      CloneProjectDto.safeParse({ ...base, dateMode: 'FIT', newStartDate: '2026-03-01' }).success,
    ).toBe(false);
    expect(
      CloneProjectDto.safeParse({
        ...base,
        dateMode: 'FIT',
        newStartDate: '2026-03-01',
        newEndDate: '2026-09-01',
      }).success,
    ).toBe(true);
  });

  it('FIT 에서 종료일이 시작일보다 앞서면 거부한다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'FIT',
      newStartDate: '2026-09-01',
      newEndDate: '2026-03-01',
    });
    expect(r.success).toBe(false);
  });

  it('FIT 에서 시작일과 종료일이 같은 날인 것은 허용한다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'FIT',
      newStartDate: '2026-09-01',
      newEndDate: '2026-09-01',
    });
    expect(r.success).toBe(true);
  });

  it('날짜 형식이 YYYY-MM-DD 가 아니면 거부한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT', newStartDate: '2026/03/01' });
    expect(r.success).toBe(false);
  });

  it('description 은 null 을 허용한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'KEEP', description: null });
    expect(r.success).toBe(true);
  });
});

describe('AuditAction', () => {
  it('PROJECT_CLONE 을 포함한다', () => {
    expect(AuditAction.safeParse('PROJECT_CLONE').success).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm -F @sam/shared test clone-dto`

Expected: FAIL — `CloneProjectDto` 가 `./index` 에서 export 되지 않는다

- [ ] **Step 3: `AuditAction` 에 `PROJECT_CLONE` 을 추가한다**

`packages/shared/src/index.ts` 의 `AuditAction` enum 에서 `'PROJECT_IMPORT_CSV',` 바로 다음 줄에 추가한다.

```ts
  'PROJECT_DELETE',
  'PROJECT_IMPORT_CSV',
  'PROJECT_CLONE',
  'MEMBER_ADD',
```

- [ ] **Step 4: 복제 DTO 를 추가한다**

`packages/shared/src/index.ts` 에서 `export type ProjectDetail = z.infer<typeof ProjectDetail>;` (~line 185) 바로 다음, `// ─── 멤버 DTO ───` 주석 앞에 넣는다.

```ts
// ─── 프로젝트 복제 DTO ─────────────────────────────────────────────────────
// dateMode 별 필수 입력이 달라서 superRefine 으로 분기 검증한다.
//  - KEEP: 날짜 입력 없음
//  - SHIFT: newStartDate 필수. 기간·간격은 보존된다
//  - FIT: newStartDate + newEndDate 필수. 기간까지 비례 사상된다
export const CloneProjectDto = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().max(2000).nullable().optional(),
    dateMode: z.enum(['KEEP', 'SHIFT', 'FIT']),
    newStartDate: IsoDate.optional(),
    newEndDate: IsoDate.optional(),
    managerUserIds: z
      .array(z.string().min(1))
      .min(1, '최소 1명의 MANAGER 가 필요합니다'),
    memberUserIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.dateMode !== 'KEEP' && !v.newStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newStartDate'],
        message: '새 시작일을 입력하세요',
      });
    }
    if (v.dateMode === 'FIT') {
      if (!v.newEndDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newEndDate'],
          message: '새 종료일을 입력하세요',
        });
      } else if (v.newStartDate && v.newEndDate < v.newStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newEndDate'],
          message: '종료일이 시작일보다 앞설 수 없습니다',
        });
      }
    }
  });
export type CloneProjectDto = z.infer<typeof CloneProjectDto>;

export const CloneProjectResult = z.object({
  project: ProjectDetail,
  nodeCount: z.number().int(),
});
export type CloneProjectResult = z.infer<typeof CloneProjectResult>;
```

- [ ] **Step 5: `clone-dates` 를 재수출한다**

`packages/shared/src/index.ts` 맨 끝(line 351)에 `export * from './history-utils';` 가 이미 있다. 그 바로 다음 줄에 나란히 추가한다.

```ts
// history-utils 의 순수 함수·데이터 타입을 그대로 재노출 (백엔드·프론트 공용)
export * from './history-utils';

// 프로젝트 복제용 날짜 재매핑 함수도 같은 이유로 재노출 (API 계산 = web 미리보기)
export * from './clone-dates';
```

- [ ] **Step 6: 테스트와 타입체크를 실행해 통과를 확인한다**

Run: `pnpm -F @sam/shared test && pnpm -F @sam/shared build && pnpm -r typecheck`

Expected: PASS — 테스트 전부 통과, `packages/shared/dist` 재생성, 전체 타입체크 통과

`build` 를 여기서 반드시 돌리는 이유: `tsconfig.base.json` 에 `paths` 가 없어서 api/web 이 `packages/shared/dist` 를 보고 타입을 해석한다 (AGENTS.md §5.3). 빌드하지 않으면 다음 태스크에서 `CloneProjectDto` 를 찾을 수 없다.

- [ ] **Step 7: 커밋한다**

```bash
git add packages/shared/src/index.ts packages/shared/src/clone-dto.test.ts
git commit -m "feat(shared): CloneProjectDto/CloneProjectResult 와 PROJECT_CLONE 감사 액션

dateMode 별 필수 입력이 달라 superRefine 으로 분기 검증한다.
SHIFT 는 newStartDate 만, FIT 은 newEndDate 까지 요구하고
종료일이 시작일보다 앞서는 조합을 거부한다."
```

---

## Task 3: 트리 재구성 순수 함수 (`apps/api`)

**Files:**
- Create: `apps/api/src/projects/clone-tree.ts`
- Test: `apps/api/src/projects/clone-tree.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `RemapPlan`, `remapDatePair`, `DatePair` (`@sam/shared` 에서)
- Produces:
  - `interface SourceNode { id, parentId, kind, title, description, startAt, endAt, sortOrder, depth }`
  - `interface ClonedNode { id, projectId, parentId, kind, title, description, startAt, endAt, progress, sortOrder, depth, createdById, updatedById, sourceNodeId }`
  - `function buildClonedNodes(args: { sourceNodes: SourceNode[]; newProjectId: string; actorId: string; plan: RemapPlan; newId: () => string }): ClonedNode[]`

- [ ] **Step 1: 테스트 파일을 작성한다 (실패하는 상태)**

`apps/api/src/projects/clone-tree.test.ts` 를 만든다. `apps/api/vitest.config.ts` 의 `include` 가 `src/**/*.test.ts` 라서 자동으로 잡힌다.

```ts
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
```

`i4` 검증값 계산: 원본 `2026-03-01` + 59일 = `2026-04-29` (3월 잔여 30 + 4월 29), `2026-03-15` + 59일 = `2026-05-13`.

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `pnpm -F @sam/api test clone-tree`

Expected: FAIL — `Failed to resolve import "./clone-tree"`

- [ ] **Step 3: 구현한다**

`apps/api/src/projects/clone-tree.ts` 를 만든다.

```ts
// 프로젝트 복제 시 일정 트리를 재구성하는 순수 함수.
//
// Prisma 를 쓰지 않아 단위 테스트가 가능하다. schedule_nodes.parent_id 가 자기참조라서
// 새 UUID 를 부여하면서 oldId → newId 맵으로 부모 포인터를 다시 엮어야 하는데,
// 이 연결이 한 군데만 틀어져도 5,000 노드 트리가 조용히 망가진다.

import { remapDatePair, type DatePair, type RemapPlan } from '@sam/shared';

/** 원본 프로젝트에서 읽어 온 노드. schedule_nodes 에서 복제에 필요한 컬럼만. */
export interface SourceNode {
  id: string;
  parentId: string | null;
  kind: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  depth: number;
}

/** 새 프로젝트에 삽입할 노드. sourceNodeId 는 DB 컬럼이 아니라 NodeHistory 기록용이다. */
export interface ClonedNode {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  progress: number;
  sortOrder: number;
  depth: number;
  createdById: string;
  updatedById: string;
  sourceNodeId: string;
}

/**
 * 원본 노드들을 새 프로젝트용 노드로 재구성한다.
 *  - 각 노드에 새 ID 를 부여하고 oldId → newId 맵으로 parentId 를 다시 엮는다
 *  - ITEM 의 날짜만 plan 대로 사상한다. GROUP 은 DB 에 날짜가 비어 있고 자손 ITEM 에서
 *    자동 계산되므로(AGENTS.md §4.6) 손대지 않는다
 *  - progress 는 전부 0 으로 초기화한다 (새 호기는 아직 시작하지 않은 일정이다)
 *  - depth 오름차순으로 정렬해 반환한다. 호출자가 이 순서대로 넣으면 부모가 항상 먼저 존재한다
 *
 * newId 를 주입받는 이유는 테스트에서 randomUUID 대신 결정적 ID 를 넣어
 * 부모 포인터가 정확히 어디로 엮였는지 단정할 수 있게 하기 위함이다.
 */
export function buildClonedNodes(args: {
  sourceNodes: SourceNode[];
  newProjectId: string;
  actorId: string;
  plan: RemapPlan;
  newId: () => string;
}): ClonedNode[] {
  const { sourceNodes, newProjectId, actorId, plan, newId } = args;

  const ordered = [...sourceNodes].sort(
    (a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder,
  );

  const idMap = new Map<string, string>();
  for (const node of ordered) idMap.set(node.id, newId());

  return ordered.map((node) => {
    const dates: DatePair =
      node.kind === 'ITEM'
        ? remapDatePair({ startAt: node.startAt, endAt: node.endAt }, plan)
        : { startAt: node.startAt, endAt: node.endAt };

    return {
      id: idMap.get(node.id)!,
      projectId: newProjectId,
      // 부모가 원본 목록에 없는 고아 노드는 루트로 올린다 (정상적으로는 발생하지 않는다)
      parentId: node.parentId === null ? null : (idMap.get(node.parentId) ?? null),
      kind: node.kind,
      title: node.title,
      description: node.description,
      startAt: dates.startAt,
      endAt: dates.endAt,
      progress: 0,
      sortOrder: node.sortOrder,
      depth: node.depth,
      createdById: actorId,
      updatedById: actorId,
      sourceNodeId: node.id,
    };
  });
}
```

- [ ] **Step 4: 테스트와 타입체크를 실행해 통과를 확인한다**

Run: `pnpm -F @sam/api test clone-tree && pnpm -r typecheck`

Expected: PASS — 14개 테스트 통과, 타입체크 통과

- [ ] **Step 5: 커밋한다**

```bash
git add apps/api/src/projects/clone-tree.ts apps/api/src/projects/clone-tree.test.ts
git commit -m "feat(api): 프로젝트 복제용 트리 재구성 순수 함수

parent_id 가 자기참조라 새 UUID 를 부여하면서 oldId → newId 맵으로
부모 포인터를 다시 엮는다. depth 오름차순으로 반환해 호출자가 그 순서로
넣으면 부모가 항상 먼저 존재한다.

ITEM 날짜만 사상하고 GROUP 은 손대지 않는다 (자손에서 자동 계산).
progress 는 전부 0 으로 초기화한다. newId 를 주입받아 테스트에서
결정적 ID 로 부모 연결을 단정한다."
```

---

## Task 4: 복제 서비스와 엔드포인트 (`apps/api`)

**Files:**
- Modify: `apps/api/src/projects/projects.service.ts` (import 블록, `hardDelete` 뒤에 `clone` 추가)
- Modify: `apps/api/src/projects/projects.controller.ts` (import 블록, `create` 뒤에 라우트 추가)

**Interfaces:**
- Consumes: Task 1 의 `findDateSpan` / `buildRemapPlan`, Task 2 의 `CloneProjectDto` / `CloneProjectResult`, Task 3 의 `buildClonedNodes`
- Produces:
  - `ProjectsService.clone(sourceId: string, input: CloneProjectDto, ctx: ActorContext): Promise<CloneProjectResult>`
  - `POST /api/v1/admin/projects/:id/clone`

- [ ] **Step 1: 서비스 import 를 추가한다**

`apps/api/src/projects/projects.service.ts` 의 `@sam/shared` import 블록에 값 import 를 추가한다. 기존 블록은 `import type { ... }` 이므로 **값(함수)은 별도 `import` 문**이 필요하다.

```ts
import type {
  CloneProjectDto,
  CloneProjectResult,
  CreateProjectDto,
  ProjectDetail,
  ProjectListItem,
  ProjectRole,
  UpdateProjectDto,
} from '@sam/shared';
import { buildRemapPlan, findDateSpan } from '@sam/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildClonedNodes } from './clone-tree';
```

- [ ] **Step 2: `clone()` 메서드를 추가한다**

`apps/api/src/projects/projects.service.ts` 의 `hardDelete()` 메서드 뒤, 클래스 닫는 `}` 앞에 넣는다.

```ts
  /**
   * 프로젝트 복제. 일정 트리를 그대로 물려받고 날짜만 새 기간으로 옮긴다.
   *
   * 멤버 승계는 클라이언트가 원본 멤버 목록을 프리필해 보내는 방식이다. 서버가 원본을
   * 다시 읽어 병합하지 않으므로 요청만 보면 결과가 예측되고, 매니저 교체가 목록을
   * 바꿔 보내는 것으로 해결된다.
   *
   * 진행률은 전부 0 으로 초기화하고 댓글과 원본 이력은 복사하지 않는다.
   */
  async clone(
    sourceId: string,
    input: CloneProjectDto,
    ctx: ActorContext,
  ): Promise<CloneProjectResult> {
    const source = await this.prisma.project.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundException({ error: 'PROJECT_NOT_FOUND' });

    const managerIds = Array.from(new Set(input.managerUserIds));
    if (managerIds.length === 0) {
      throw new BadRequestException({ error: 'MANAGER_REQUIRED' });
    }
    // 같은 사람이 양쪽에 오면 MANAGER 를 우선한다 (project_members 의 복합 PK 중복 방지).
    const managerSet = new Set(managerIds);
    const memberIds = Array.from(new Set(input.memberUserIds)).filter(
      (id) => !managerSet.has(id),
    );

    const allIds = [...managerIds, ...memberIds];
    const found = await this.prisma.user.findMany({
      where: { id: { in: allIds }, isActive: true },
      select: { id: true },
    });
    if (found.length !== allIds.length) {
      const foundSet = new Set(found.map((u) => u.id));
      throw new BadRequestException({
        error: 'INVALID_MEMBER_IDS',
        missing: allIds.filter((id) => !foundSet.has(id)),
      });
    }

    const sourceNodes = await this.prisma.scheduleNode.findMany({
      where: { projectId: sourceId },
      select: {
        id: true,
        parentId: true,
        kind: true,
        title: true,
        description: true,
        startAt: true,
        endAt: true,
        sortOrder: true,
        depth: true,
      },
    });

    // span 은 ITEM 에서만 뽑는다. GROUP 은 DB 에 날짜가 비어 있다 (AGENTS.md §4.6).
    const span = findDateSpan(sourceNodes.filter((n) => n.kind === 'ITEM'));
    if (input.dateMode !== 'KEEP' && span === null) {
      throw new BadRequestException({
        error: 'NO_DATED_ITEMS',
        message:
          '원본 프로젝트에 날짜가 지정된 일정이 없어 일정을 옮길 수 없습니다. 원본 일정 유지로 복제하십시오.',
      });
    }
    const plan = buildRemapPlan(span, input);

    const newProjectId = randomUUID();
    const cloned = buildClonedNodes({
      sourceNodes,
      newProjectId,
      actorId: ctx.actorId,
      plan,
      newId: randomUUID,
    });

    const now = new Date();
    const created = await this.prisma.$transaction(
      async (tx) => {
        const proj = await tx.project.create({
          data: {
            id: newProjectId,
            name: input.name,
            description: input.description ?? null,
            // 보관된 지난 호기를 템플릿으로 써도 새 호기는 활성 상태로 시작한다.
            status: 'ACTIVE',
            createdById: ctx.actorId,
          },
        });

        await tx.projectMember.createMany({
          data: [
            ...managerIds.map((userId) => ({
              projectId: newProjectId,
              userId,
              role: 'MANAGER',
              addedById: ctx.actorId,
              addedAt: now,
            })),
            ...memberIds.map((userId) => ({
              projectId: newProjectId,
              userId,
              role: 'MEMBER',
              addedById: ctx.actorId,
              addedAt: now,
            })),
          ],
        });

        // parent_id 가 자기참조 FK 라 부모 행이 먼저 있어야 한다. createMany 는 배열 순서
        // 삽입을 보장하지 않으므로 depth 별로 호출을 쪼갠다. 최대 깊이 5 라서 5 회로 끝난다.
        const maxDepth = cloned.reduce((m, n) => Math.max(m, n.depth), 0);
        for (let d = 0; d <= maxDepth; d += 1) {
          const batch = cloned.filter((n) => n.depth === d);
          if (batch.length === 0) continue;
          await tx.scheduleNode.createMany({
            // sourceNodeId 는 DB 컬럼이 아니므로 떼어낸다.
            data: batch.map(({ sourceNodeId: _drop, ...row }) => row),
          });
        }

        if (cloned.length > 0) {
          await tx.nodeHistory.createMany({
            data: cloned.map((n) => ({
              id: randomUUID(),
              nodeId: n.id,
              nodeIdSnapshot: n.id,
              projectIdSnapshot: newProjectId,
              actorId: ctx.actorId,
              action: 'CREATE',
              diffJson: JSON.stringify({
                clonedFrom: { projectId: sourceId, nodeId: n.sourceNodeId },
              }),
            })),
          });
        }

        return proj;
      },
      // 노드 5,000 개 상한을 감안해 넉넉히 잡는다. SQLite 는 단일 writer 라 이 동안 다른 쓰기는 대기한다.
      { timeout: 30_000, maxWait: 10_000 },
    );

    await this.audit.log({
      actorId: ctx.actorId,
      action: 'PROJECT_CLONE',
      targetType: 'project',
      targetId: created.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      payload: {
        sourceProjectId: sourceId,
        sourceProjectName: source.name,
        name: created.name,
        dateMode: input.dateMode,
        ...(input.newStartDate !== undefined ? { newStartDate: input.newStartDate } : {}),
        ...(input.newEndDate !== undefined ? { newEndDate: input.newEndDate } : {}),
        nodeCount: cloned.length,
        managerUserIds: managerIds,
        memberUserIds: memberIds,
      },
    });
    if (ctx.adminMode) {
      await this.audit.log({
        actorId: ctx.actorId,
        action: 'ADMIN_OVERRIDE_EDIT',
        targetType: 'project',
        targetId: created.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        payload: { sub: 'PROJECT_CLONE' },
      });
    }

    return {
      project: {
        id: created.id,
        name: created.name,
        description: created.description,
        status: 'ACTIVE',
        myRole: managerSet.has(ctx.actorId)
          ? 'MANAGER'
          : memberIds.includes(ctx.actorId)
            ? 'MEMBER'
            : null,
        memberCount: managerIds.length + memberIds.length,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        createdById: created.createdById,
      },
      nodeCount: cloned.length,
    };
  }
```

- [ ] **Step 3: 컨트롤러에 라우트를 추가한다**

`apps/api/src/projects/projects.controller.ts` 의 import 블록을 고친다.

```ts
import {
  CloneProjectDto,
  CreateProjectDto,
  UpdateProjectDto,
  type CloneProjectResult,
  type ProjectDetail,
  type ProjectListItem,
} from '@sam/shared';
```

그리고 `create()` 메서드 뒤에 라우트를 추가한다.

```ts
  /**
   * 프로젝트 복제. 기존 프로젝트 생성(POST admin/projects)과 같은 권한 정책이다.
   *
   * @UsePipes 를 쓰지 않는 이유: path param(:id)에도 적용되어 body 스키마로 UUID 를
   * 검증하려 든다. 반드시 @Body 에 파이프를 직접 붙인다.
   */
  @Post('admin/projects/:id/clone')
  @AdminOnly()
  clone(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CloneProjectDto)) body: CloneProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CloneProjectResult> {
    return this.projects.clone(id, body, {
      actorId: req.user!.id,
      globalRole: req.user!.globalRole,
      adminMode: req.adminMode === true,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
```

- [ ] **Step 4: 타입체크와 전체 테스트를 실행한다**

Run: `pnpm -r typecheck && pnpm -F @sam/api test`

Expected: PASS — 타입체크 통과, 기존 api 테스트(마이그레이션·백업 관련)와 Task 3 테스트 모두 통과

여기서 걸릴 수 있는 것: `exactOptionalPropertyTypes: true` 때문에 `input.newStartDate` 를 audit payload 에 그냥 펼치면 `undefined` 가 들어간다. 위 코드는 `... !== undefined ? { } : {}` 로 분기해 두었으니 그대로 쓴다 (AGENTS.md §4.3).

- [ ] **Step 5: 커밋한다**

```bash
git add apps/api/src/projects/projects.service.ts apps/api/src/projects/projects.controller.ts
git commit -m "feat(api): POST admin/projects/:id/clone 프로젝트 복제

날짜 재매핑과 트리 재구성 순수 함수를 조립해 한 트랜잭션으로 넣는다.
parent_id 가 자기참조라 depth 별로 createMany 를 쪼개 부모를 먼저 넣고,
노드마다 CREATE 이력을 남겨 어느 프로젝트에서 복제됐는지 추적한다.

멤버는 요청으로 받은 목록을 그대로 쓰고 활성 사용자 여부만 검증한다.
managerUserIds 와 memberUserIds 가 겹치면 MANAGER 를 우선한다.
SHIFT/FIT 인데 원본에 날짜가 없으면 400 NO_DATED_ITEMS."
```

---

## Task 5: 복제 폼 페이지 (`apps/web`)

**Files:**
- Modify: `apps/web/src/lib/projects.ts` (파일 끝에 훅 추가)
- Create: `apps/web/src/pages/ProjectClonePage.tsx`

**Interfaces:**
- Consumes: Task 2 의 `CloneProjectDto` / `CloneProjectResult`, Task 1 의 `findDateSpan` / `buildRemapPlan` / `remapDatePair` / `toEpochDay`, 기존 `useProject` / `useMembers` / `useUsers` / `useNodes`
- Produces:
  - `useCloneProject(sourceId: string)` — `mutateAsync(input: CloneProjectDto) => Promise<CloneProjectResult>`
  - `ProjectClonePage` — default export React 컴포넌트

**미리 확정된 기존 인터페이스** (직접 확인함, 추측 아님):
- `useNodes(projectId: string | undefined)` — `apps/web/src/lib/nodes.ts:14`. `NodeTreeItem[]` 을 반환한다
- `NodeTreeItem` — `packages/shared/src/index.ts:260`. `kind: 'GROUP'|'ITEM'`, `startAt: string | null`, `endAt: string | null` 을 가진다. GROUP 은 `startAt`/`endAt` 이 `null` 이고 `startAtEffective`/`endAtEffective` 에 집계값이 들어 있다
- **미리보기 span 은 `startAt`/`endAt` (직접 입력값)으로 계산한다.** `startAtEffective` 를 쓰면 GROUP 의 집계값이 중복 반영되지만 min/max 결과는 같다 — 그래도 서버가 보는 것과 정확히 같은 값을 쓰기 위해 ITEM 의 `startAt`/`endAt` 만 쓴다
- `ProjectMemberItem` — `packages/shared/src/index.ts:194`. `userId` / `username` / `displayName` / `role` / `addedAt`
- `UserListItem` 의 필드는 `id` / `username` / `displayName` (`useUsers` 가 반환)

- [ ] **Step 1: `useCloneProject` 훅을 추가한다**

`apps/web/src/lib/projects.ts` 파일 끝에 추가한다. import 블록의 `type` 목록에 `CloneProjectDto`, `CloneProjectResult` 를 넣는다.

```ts
export function useCloneProject(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloneProjectDto) =>
      api.post<CloneProjectResult>(`/admin/projects/${sourceId}/clone`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}
```

- [ ] **Step 2: `ProjectClonePage` 를 만든다**

`apps/web/src/pages/ProjectClonePage.tsx` 를 만든다. `ProjectNewPage.tsx` 의 구조·스타일·권한 가드를 그대로 따른다.

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CloneProjectDto,
  buildRemapPlan,
  findDateSpan,
  remapDatePair,
  toEpochDay,
  type CloneDateMode,
  type ProjectRole,
} from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProject, useCloneProject } from '../lib/projects';
import { useMembers } from '../lib/members';
import { useNodes } from '../lib/nodes';
import { useUsers } from '../lib/users';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/** 승계 대상 한 명. role 이 null 이면 새 프로젝트에서 제외한다. */
interface MemberDraft {
  userId: string;
  displayName: string;
  username: string;
  role: ProjectRole | null;
}

export default function ProjectClonePage() {
  const { id: sourceId } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const navigate = useNavigate();

  const source = useProject(sourceId);
  const sourceMembers = useMembers(sourceId);
  const sourceNodes = useNodes(sourceId);
  const users = useUsers({ status: 'active' });
  const clone = useCloneProject(sourceId ?? '');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dateMode, setDateMode] = useState<CloneDateMode>('KEEP');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [drafts, setDrafts] = useState<MemberDraft[]>([]);
  const [draftsSeeded, setDraftsSeeded] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 원본 이름·설명을 한 번만 프리필한다. 이후 사용자가 고친 값을 덮지 않는다.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !source.data) return;
    setName(`${source.data.name} (복사)`);
    setDescription(source.data.description ?? '');
    setPrefilled(true);
  }, [source.data, prefilled]);

  // 원본 멤버를 역할 그대로 프리필한다.
  useEffect(() => {
    if (draftsSeeded || !sourceMembers.data) return;
    setDrafts(
      sourceMembers.data.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        username: m.username,
        role: m.role,
      })),
    );
    setDraftsSeeded(true);
  }, [sourceMembers.data, draftsSeeded]);

  // 원본 일정 span. ITEM 만 본다 — GROUP 은 DB 에 날짜가 비어 있다.
  const span = useMemo(() => {
    if (!sourceNodes.data) return null;
    return findDateSpan(
      sourceNodes.data
        .filter((n) => n.kind === 'ITEM')
        .map((n) => ({ startAt: n.startAt, endAt: n.endAt })),
    );
  }, [sourceNodes.data]);

  const spanDays = span ? toEpochDay(span.end) - toEpochDay(span.start) + 1 : 0;

  // API 가 실제 복제에서 쓰는 것과 같은 함수로 계산한 미리보기.
  const preview = useMemo(() => {
    if (dateMode === 'KEEP') return span;
    if (!span || !newStartDate) return null;
    if (dateMode === 'FIT' && !newEndDate) return null;
    if (dateMode === 'FIT' && newEndDate < newStartDate) return null;
    try {
      const plan = buildRemapPlan(span, { mode: dateMode, newStartDate, newEndDate });
      const out = remapDatePair({ startAt: span.start, endAt: span.end }, plan);
      if (!out.startAt || !out.endAt) return null;
      return { start: out.startAt, end: out.endAt };
    } catch {
      return null;
    }
  }, [dateMode, span, newStartDate, newEndDate]);

  const managerCount = drafts.filter((d) => d.role === 'MANAGER').length;

  // 원본 멤버가 아닌 사용자만 추가 후보로 보여준다.
  const addCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !users.data) return [];
    const taken = new Set(drafts.map((d) => d.userId));
    return users.data
      .filter((u) => !taken.has(u.id))
      .filter(
        (u) =>
          u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [users.data, drafts, search]);

  if (me.isLoading) return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  if (me.data?.globalRole !== 'ADMIN' || !adminMode) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">접근 권한 없음</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          이 페이지는 관리자 모드에서 ADMIN 사용자만 접근할 수 있습니다.
        </p>
      </main>
    );
  }

  function setRole(userId: string, role: ProjectRole | null) {
    setDrafts((prev) => prev.map((d) => (d.userId === userId ? { ...d, role } : d)));
  }

  function addUser(u: { id: string; displayName: string; username: string }) {
    setDrafts((prev) => [
      ...prev,
      { userId: u.id, displayName: u.displayName, username: u.username, role: 'MEMBER' },
    ]);
    setSearch('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sourceId) return;

    const parsed = CloneProjectDto.safeParse({
      name: name.trim(),
      description: description.trim() || null,
      dateMode,
      ...(dateMode !== 'KEEP' ? { newStartDate } : {}),
      ...(dateMode === 'FIT' ? { newEndDate } : {}),
      managerUserIds: drafts.filter((d) => d.role === 'MANAGER').map((d) => d.userId),
      memberUserIds: drafts.filter((d) => d.role === 'MEMBER').map((d) => d.userId),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }

    try {
      const result = await clone.mutateAsync(parsed.data);
      toast.success(`프로젝트가 복제되었습니다. (일정 ${result.nodeCount}개)`);
      navigate(`/projects/${result.project.id}`, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  const inputCls =
    'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold">프로젝트 복제</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        원본: {source.data?.name ?? '…'}
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">새 프로젝트 이름 *</span>
          <input
            className={inputCls}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="block text-slate-700 dark:text-slate-300">설명</span>
          <textarea
            className={inputCls}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>

        <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-semibold">일정 처리</legend>

          {sourceNodes.isLoading && (
            <p className="text-xs text-slate-500">원본 일정 확인 중…</p>
          )}
          {span && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              원본 일정: {span.start} ~ {span.end} ({spanDays}일)
            </p>
          )}
          {sourceNodes.data && !span && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              원본에 날짜가 지정된 일정이 없어 날짜를 옮길 수 없습니다. 원본 일정 유지만
              선택할 수 있습니다.
            </p>
          )}

          <div className="mt-3 space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'KEEP'}
                onChange={() => setDateMode('KEEP')}
              />
              <span>
                <span className="font-medium">원본 일정 그대로 유지</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  날짜를 손대지 않습니다.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'SHIFT'}
                disabled={!span}
                onChange={() => setDateMode('SHIFT')}
              />
              <span>
                <span className="font-medium">시작일만 지정해서 통째로 밀기</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  각 일정의 기간과 일정 사이 간격이 그대로 보존됩니다.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                checked={dateMode === 'FIT'}
                disabled={!span}
                onChange={() => setDateMode('FIT')}
              />
              <span>
                <span className="font-medium">새 기간에 맞춰 늘리거나 줄이기</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  전체 일정이 새 범위를 채우도록 비례 조정됩니다. 각 일정의 기간도 함께
                  늘거나 줄어듭니다.
                </span>
              </span>
            </label>
          </div>

          {dateMode !== 'KEEP' && (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="block text-sm">
                <span className="block text-slate-700 dark:text-slate-300">새 시작일 *</span>
                <input
                  className={inputCls}
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  required
                />
              </label>
              {dateMode === 'FIT' && (
                <label className="block text-sm">
                  <span className="block text-slate-700 dark:text-slate-300">새 종료일 *</span>
                  <input
                    className={inputCls}
                    type="date"
                    value={newEndDate}
                    min={newStartDate || undefined}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    required
                  />
                </label>
              )}
            </div>
          )}

          {preview && (
            <p className="mt-3 rounded bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
              복제 후 일정: {preview.start} ~ {preview.end} (
              {toEpochDay(preview.end) - toEpochDay(preview.start) + 1}일)
            </p>
          )}
        </fieldset>

        <fieldset className="rounded border border-slate-200 p-3 dark:border-slate-700">
          <legend className="px-1 text-sm font-semibold">멤버 승계 *</legend>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            원본 멤버를 그대로 물려받습니다. 역할을 바꾸거나 제외할 수 있습니다. MANAGER 는
            최소 1명이 필요합니다. (현재 MANAGER {managerCount}명)
          </p>

          {sourceMembers.isLoading && (
            <p className="mt-2 text-sm text-slate-500">원본 멤버 로딩…</p>
          )}

          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {drafts.map((d) => (
              <li key={d.userId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1 text-sm">
                  {d.displayName}{' '}
                  <span className="text-xs text-slate-500">@{d.username}</span>
                </span>
                <div className="flex gap-3 text-xs">
                  {(['MANAGER', 'MEMBER'] as const).map((role) => (
                    <label key={role} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`role-${d.userId}`}
                        checked={d.role === role}
                        onChange={() => setRole(d.userId, role)}
                      />
                      {role}
                    </label>
                  ))}
                  <label className="flex items-center gap-1 text-slate-500">
                    <input
                      type="radio"
                      name={`role-${d.userId}`}
                      checked={d.role === null}
                      onChange={() => setRole(d.userId, null)}
                    />
                    제외
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <input
              type="search"
              placeholder="사용자 검색해서 추가"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            {addCandidates.length > 0 && (
              <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {addCandidates.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addUser(u)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      + {u.displayName}{' '}
                      <span className="text-xs text-slate-500">@{u.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>

        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={clone.isPending || managerCount === 0}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {clone.isPending ? '복제 중…' : '복제'}
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: 타입체크와 web 테스트를 실행한다**

Run: `pnpm -r typecheck && pnpm -F @sam/web test`

Expected: PASS — 타입체크 통과, 기존 web 테스트(`ganttMath` / `ganttLayout` / `bulkSelection` 등)도 그대로 통과

- [ ] **Step 4: 커밋한다**

```bash
git add apps/web/src/lib/projects.ts apps/web/src/pages/ProjectClonePage.tsx
git commit -m "feat(web): 프로젝트 복제 폼 페이지

일정 처리 3모드 라디오와 원본 일정 범위 표시, 입력 즉시 미리보기.
미리보기는 @sam/shared 의 buildRemapPlan/remapDatePair 를 그대로 써서
API 의 실제 계산과 어긋나지 않는다.

멤버는 원본 역할로 프리필하고 행마다 MANAGER/MEMBER/제외를 고른다.
검색으로 신규 인원을 추가할 수 있고 MANAGER 가 0명이면 제출을 막는다.
원본에 날짜가 없으면 시작일/범위 지정 옵션을 비활성화한다."
```

---

## Task 6: 라우트 등록과 목록 진입점 (`apps/web`)

**Files:**
- Modify: `apps/web/src/App.tsx` (import 블록 ~line 13, `/projects/:id/history` 라우트 뒤)
- Modify: `apps/web/src/pages/ProjectsPage.tsx` ("관리" 열 `<td>` ~line 494-511, `defaultWidths.manage`, `totalTableWidth`)

**Interfaces:**
- Consumes: Task 5 의 `ProjectClonePage`
- Produces: 사용자가 도달할 수 있는 `/projects/:id/clone` 경로

- [ ] **Step 1: 라우트를 등록한다**

`apps/web/src/App.tsx` 의 import 블록에서 `ProjectHistoryPage` import 다음 줄에 추가한다.

```tsx
import ProjectHistoryPage from './pages/ProjectHistoryPage';
import ProjectClonePage from './pages/ProjectClonePage';
```

그리고 `/projects/:id/history` 라우트 다음에 라우트를 추가한다.

```tsx
          <Route
            path="/projects/:id/clone"
            element={
              <RequireAuth>
                <ProjectClonePage />
              </RequireAuth>
            }
          />
```

- [ ] **Step 2: "관리" 열 폭을 넓힌다**

`ProjectsPage.tsx` 의 `defaultWidths` 에서 `manage` 를 늘린다. 복제·삭제 버튼 두 개가 들어가야 한다.

```ts
    updatedAt: 130,
    manage: 140,
  };
```

`totalTableWidth` 계산은 이미 `columnWidths.manage` 를 쓰므로 손댈 필요가 없다.

> 주의: 기존 사용자의 localStorage(`sam_project_list_column_widths`)에 `manage: 90` 이 저장돼 있으면 그 값이 우선한다. 버튼이 좁아 보이면 사용자가 열 경계를 드래그해 넓힐 수 있으므로 별도 마이그레이션은 하지 않는다.

- [ ] **Step 3: "관리" 열에 복제 버튼을 추가한다**

`ProjectsPage.tsx` 의 관리 `<td>` 안쪽을 통째로 바꾼다. 기존에는 `ARCHIVED` 일 때만 삭제 버튼, 아니면 `-` 였다. 이제 복제는 상태와 무관하게 항상 보인다 — 지난 호기(보관됨)를 템플릿으로 쓰는 게 자연스럽기 때문이다.

기존:

```tsx
                        {p.status === 'ARCHIVED' ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors"
                          >
                            삭제
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">-</span>
                        )}
```

변경 후:

```tsx
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            to={`/projects/${p.id}/clone`}
                            className="rounded bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:hover:bg-sky-950/60 transition-colors"
                            title="이 프로젝트를 템플릿으로 새 프로젝트 만들기"
                          >
                            복제
                          </Link>
                          {p.status === 'ARCHIVED' && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              className="rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors"
                            >
                              삭제
                            </button>
                          )}
                        </div>
```

`Link` 는 `ProjectsPage.tsx` 1행에서 이미 임포트돼 있으므로 import 추가는 필요 없다.

- [ ] **Step 4: 타입체크와 빌드를 실행한다**

Run: `pnpm -r typecheck && pnpm -F @sam/web build`

Expected: PASS — 타입체크 통과, vite 빌드 성공

- [ ] **Step 5: 커밋한다**

```bash
git add apps/web/src/App.tsx apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): 프로젝트 목록에 복제 진입점 추가

/projects/:id/clone 라우트를 등록하고 목록 '관리' 열에 복제 버튼을 둔다.
보관된 프로젝트도 복제할 수 있다 — 지난 호기를 템플릿으로 쓰는 게
자연스럽기 때문이다. 버튼 두 개가 들어가도록 열 기본 폭을 넓혔다."
```

---

## Task 7: 수동 검증과 문서 갱신

**Files:**
- Modify: `AGENTS.md` (§6 마일스톤 목록)

**Interfaces:**
- Consumes: Task 1~6 전체
- Produces: 없음 (검증과 문서)

- [ ] **Step 1: 전체 테스트와 타입체크를 돌린다**

Run: `pnpm -r typecheck && pnpm -r test`

Expected: PASS — shared / api / web 세 워크스페이스의 테스트가 모두 통과

- [ ] **Step 2: 로컬 서버를 띄운다**

Run: `pnpm dev`

`http://localhost:5173` 에 접속해 `admin` 으로 로그인하고, 헤더에서 **관리자 모드를 켠다**. 복제 버튼은 관리자 모드에서만 보인다.

- [ ] **Step 3: 세 모드를 각각 검증한다**

일정이 여러 depth 에 걸쳐 있고 ITEM 에 날짜가 들어 있는 프로젝트를 하나 골라 복제 페이지로 들어간다. 아래를 순서대로 확인한다.

1. **원본 일정 범위 표시** — `원본 일정: YYYY-MM-DD ~ YYYY-MM-DD (N일)` 이 원본 Gantt 뷰의 전체 범위와 일치하는지
2. **`KEEP`** — 복제 후 트리 구조와 모든 날짜가 원본과 동일한지. GROUP 의 집계 기간도 같은지
3. **`SHIFT`** — 새 시작일을 원본보다 2달 뒤로 넣는다. 미리보기의 일수(`N일`)가 원본과 **똑같은지**. 복제 후 각 ITEM 의 기간과 일정 사이 간격이 원본과 같은지
4. **`FIT`** — 새 범위를 원본의 약 2배로 넣는다. 미리보기 일수가 새 범위와 맞는지. 복제 후 개별 ITEM 의 기간도 대략 2배가 됐는지
5. **진행률** — 원본에 진행률이 들어 있던 ITEM 이 복제본에서 전부 0% 인지
6. **GROUP 집계** — Gantt 뷰에서 GROUP 의 기간이 자손 ITEM 범위로 자동 계산되는지 (직접 입력하지 않았으므로)
7. **멤버 승계** — 원본 멤버가 역할대로 프리필되는지. MANAGER 를 다른 사람으로 바꿔 복제하면 새 프로젝트 멤버 목록에 그대로 반영되는지. `제외` 를 고른 사람이 빠지는지
8. **MANAGER 0명** — 전원 `제외` 로 바꾸면 복제 버튼이 비활성화되는지
9. **날짜 없는 프로젝트** — ITEM 에 날짜가 하나도 없는 프로젝트에서는 시작일/범위 지정 라디오가 비활성화되고 안내 문구가 뜨는지
10. **보관된 프로젝트** — `ARCHIVED` 프로젝트도 복제 가능하고, 새 프로젝트는 `활성` 으로 생기는지
11. **이력** — 새 프로젝트의 이력 페이지(`/projects/:id/history`)에 노드별 `CREATE` 기록이 보이는지

- [ ] **Step 4: 발견한 문제를 고친다**

문제가 있으면 해당 태스크의 파일로 돌아가 고치고, 관련 단위 테스트를 추가한 뒤 별도로 커밋한다.

- [ ] **Step 5: `AGENTS.md` 마일스톤을 갱신한다**

`AGENTS.md` §6 의 M5 항목에 한 줄 추가한다.

```markdown
2. **M5**: 프로젝트 단위 백업 및 복원 UI
   - 특정 프로젝트를 manifest 데이터를 포함한 단일 ZIP 파일로 백업하고, 업로드 시 새 프로젝트로 시딩 및 매핑해 복원하는 관리자 플로우 구현
   - 프로젝트 복제 (일정 트리 승계 + 날짜 재매핑) 구현 완료 — `docs/superpowers/specs/2026-08-01-project-clone-design.md`
```

- [ ] **Step 6: 커밋한다**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md 마일스톤에 프로젝트 복제 완료 기록"
```

---

## DB 변경 사항 (AGENTS.md §7 알림 대상)

**스키마 변경 없음.** 이 계획은 `prisma/schema.prisma` 도, `prisma/migrations/` 도 건드리지 않는다.

기존 테이블에 행만 추가한다:

| 테이블 | 복제 시 추가되는 행 |
|---|---|
| `projects` | 1건 (`status='ACTIVE'`) |
| `project_members` | 승계 멤버 수만큼 |
| `schedule_nodes` | 원본 노드 수만큼 (`progress=0`, 새 UUID, 새 `parent_id`) |
| `node_history` | 원본 노드 수만큼 (`action='CREATE'`, `diff_json` 에 `clonedFrom`) |
| `audit_logs` | 1~2건 (`PROJECT_CLONE`, 관리자 모드면 `ADMIN_OVERRIDE_EDIT` 도) |

b7721fa 이후 `prisma/migrations/` 가 단일 원본이 되었지만 이 기능은 거기에 손대지 않으므로
**exe 배포판에서 `sp-migrate.exe` 재실행이 필요 없다.** 복제 기능이 들어간 새 exe 로 교체해도
기존 DB 가 그대로 동작한다.
