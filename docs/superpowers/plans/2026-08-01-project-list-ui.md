# 프로젝트 목록 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 목록 테이블이 화면 폭을 남김없이 쓰게 하고, 목록에서 곧바로 프로젝트 명칭을 고치고 보관·복원할 수 있게 한다.

**Architecture:** 프론트엔드만 고친다. 컬럼 폭 분배는 순수 함수(`computeRenderedWidths`)로 떼어 내 단위 테스트하고, 이름 편집 로직은 훅(`useProjectNameEdit`)으로 내려 상세 화면과 목록 셀이 껍데기만 따로 갖게 한다. TanStack Query 훅은 `map()` 안에서 못 부르므로 보관 버튼과 이름 셀은 행 단위 컴포넌트로 만든다.

**Tech Stack:** React 18, TypeScript 5.6, Tailwind CSS 3.4, TanStack Query 5, Vitest 2 (jsdom 없음 — 순수 로직만 테스트)

**설계 문서:** `docs/superpowers/specs/2026-08-01-project-list-ui-design.md`

## Global Constraints

- 백엔드(`apps/api`), `packages/shared`, Prisma 스키마, 마이그레이션 — **변경 금지**. 이 계획의 모든 변경은 `apps/web` 안에서 끝난다.
- 모든 수정 요청에 `expectedUpdatedAt` 을 동봉한다 (AGENTS.md 4.5 낙관적 잠금).
- 명칭 변경·보관·복원은 `isAdmin && adminMode` 에서만 노출한다. 일반 USER 화면은 지금 그대로다.
- `cd` 를 독립 실행하지 않는다. 명령은 리포지토리 루트(`D:\workspace\prj\work\sam-scheduler`)에서 `pnpm -F @sam/web ...` 형태로 돌린다.
- 기존 인라인 주석·docstring 은 기능 변경과 무관하면 지우지 않는다 (AGENTS.md 4.1).
- `apps/web` 에는 `@testing-library/react` 와 `jsdom` 이 **없다**. 컴포넌트 렌더 테스트를 새로 만들지 않는다. 자동 테스트는 순수 함수만 대상으로 한다.
- 브랜치: `feat/project-list-ui` (이미 생성되어 있고 설계 문서 커밋 `43e6f7e` 가 올라가 있다).
- **줄 번호 주의**: 이 계획의 `ProjectsPage.tsx:NNN` 은 전부 **작업 시작 전 원본** 기준이다. 앞선 태스크가 줄을 넣고 빼면서 번호가 밀리므로, 줄 번호는 위치를 가리키는 힌트로만 쓰고 실제로는 **인용된 코드 내용으로 찾아서** 고친다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `apps/web/src/lib/projectListColumns.ts` | 신규. 컬럼 기본 폭 상수와 남는 폭 분배 계산 (순수) |
| `apps/web/src/lib/projectListColumns.test.ts` | 신규. 위 함수의 단위 테스트 |
| `apps/web/src/lib/useProjectNameEdit.ts` | 신규. 명칭 인라인 편집의 상태·제출·에러 처리 (React 훅) |
| `apps/web/src/components/ProjectNameEditor.tsx` | 수정. 훅을 쓰도록 축소. 겉모습·동작 불변 |
| `apps/web/src/components/ProjectNameCell.tsx` | 신규. 목록 셀용 인라인 편집 껍데기 |
| `apps/web/src/components/ProjectArchiveButton.tsx` | 신규. 목록 행의 보관/복원 버튼 |
| `apps/web/src/pages/ProjectsPage.tsx` | 수정. 컨테이너 클래스, 폭 계산 연결, 이름 셀 교체, 보관 버튼 추가, 페이지 clamp |

---

### Task 1: 컬럼 폭 분배 순수 함수

**Files:**
- Create: `apps/web/src/lib/projectListColumns.ts`
- Test: `apps/web/src/lib/projectListColumns.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `DEFAULT_COLUMN_WIDTHS: Record<ProjectColumnKey, number>`
  - `type ProjectColumnKey = 'name' | 'description' | 'status' | 'memberCount' | 'myRole' | 'createdAt' | 'updatedAt' | 'manage'`
  - `FLEX_COLUMN: ProjectColumnKey` (값은 `'description'`)
  - `computeRenderedWidths(stored: Record<string, number>, containerWidth: number, adminMode: boolean): { widths: Record<ProjectColumnKey, number>; tableWidth: number }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/projectListColumns.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_WIDTHS,
  FLEX_COLUMN,
  computeRenderedWidths,
  type ProjectColumnKey,
} from './projectListColumns';

/** 관리자 모드일 때 보이는 모든 컬럼의 기본 폭 합계 */
const FULL_SUM = (Object.keys(DEFAULT_COLUMN_WIDTHS) as ProjectColumnKey[]).reduce(
  (acc, k) => acc + DEFAULT_COLUMN_WIDTHS[k],
  0,
);

/** 관리자 모드가 아닐 때의 합계 (manage 제외) */
const BASE_SUM = FULL_SUM - DEFAULT_COLUMN_WIDTHS.manage;

describe('computeRenderedWidths', () => {
  it('컨테이너가 합계보다 넓으면 남는 폭을 설명 컬럼이 흡수한다', () => {
    const container = FULL_SUM + 300;
    const { widths, tableWidth } = computeRenderedWidths({}, container, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 300);
    expect(tableWidth).toBe(container);
  });

  it('설명 말고 다른 컬럼은 건드리지 않는다', () => {
    const { widths } = computeRenderedWidths({}, FULL_SUM + 300, true);

    expect(widths.name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
    expect(widths.manage).toBe(DEFAULT_COLUMN_WIDTHS.manage);
  });

  it('컨테이너가 합계보다 좁으면 아무것도 늘리지 않는다 (가로 스크롤)', () => {
    const { widths, tableWidth } = computeRenderedWidths({}, 400, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN]);
    expect(tableWidth).toBe(FULL_SUM);
  });

  it('컨테이너 폭이 0 이면 (측정 전) 합계를 그대로 돌려준다', () => {
    const { widths, tableWidth } = computeRenderedWidths({}, 0, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN]);
    expect(tableWidth).toBe(FULL_SUM);
  });

  it('관리자 모드가 아니면 manage 를 합계에서 뺀다', () => {
    const { tableWidth } = computeRenderedWidths({}, 0, false);

    expect(tableWidth).toBe(BASE_SUM);
  });

  it('관리자 모드가 아닐 때도 남는 폭 계산은 manage 를 뺀 합계 기준이다', () => {
    const container = BASE_SUM + 120;
    const { widths, tableWidth } = computeRenderedWidths({}, container, false);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 120);
    expect(tableWidth).toBe(container);
  });

  it('저장된 폭이 있으면 그것을 쓴다', () => {
    const { widths } = computeRenderedWidths({ name: 500 }, 0, true);

    expect(widths.name).toBe(500);
  });

  it('저장값에 없는 키는 기본값으로 메운다', () => {
    const { widths } = computeRenderedWidths({ name: 500 }, 0, true);

    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
  });

  it('저장값이 0 이하거나 숫자가 아니면 기본값으로 되돌린다', () => {
    const { widths } = computeRenderedWidths(
      { name: 0, status: -50, myRole: NaN },
      0,
      true,
    );

    expect(widths.name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
    expect(widths.myRole).toBe(DEFAULT_COLUMN_WIDTHS.myRole);
  });

  it('저장값이 반영된 뒤의 합계를 기준으로 남는 폭을 계산한다', () => {
    // name 을 240 → 340 으로 넓히면 합계가 100 늘어난다
    const stored = { name: DEFAULT_COLUMN_WIDTHS.name + 100 };
    const container = FULL_SUM + 300;
    const { widths, tableWidth } = computeRenderedWidths(stored, container, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 200);
    expect(tableWidth).toBe(container);
  });

  it('관리 컬럼 기본 폭은 180 이다 (보관/복제/삭제 세 버튼)', () => {
    expect(DEFAULT_COLUMN_WIDTHS.manage).toBe(180);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm -F @sam/web exec vitest run src/lib/projectListColumns.test.ts`
Expected: FAIL — `Failed to resolve import "./projectListColumns"`

- [ ] **Step 3: 구현을 쓴다**

`apps/web/src/lib/projectListColumns.ts` 를 새로 만든다.

```ts
/**
 * 프로젝트 목록 테이블의 컬럼 폭 계산 (docs/superpowers/specs/2026-08-01-project-list-ui-design.md)
 *
 * 테이블은 컬럼 폭 합계만큼의 고정 픽셀 폭으로 그려진다. 그래서 넓은 화면에서는
 * 오른쪽이 통째로 빈다. 남는 폭을 설명 컬럼에 얹어 테이블이 화면을 채우게 하는 계산을
 * 여기 모아 둔다. UI 와 떼어 놓은 이유는 이 계산이 리사이즈 드래그와 얽혀 있어
 * 눈으로 확인하기 어렵기 때문이다.
 */

/** 하드코딩 기본 폭. localStorage 에 저장된 값이 없을 때 쓴다. */
export const DEFAULT_COLUMN_WIDTHS = {
  name: 240,
  description: 380,
  status: 90,
  memberCount: 90,
  myRole: 130,
  createdAt: 130,
  updatedAt: 130,
  // 보관/복제/삭제 세 버튼이 들어가므로 다른 컬럼보다 넓다.
  manage: 180,
} as const satisfies Record<string, number>;

export type ProjectColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

/** 관리자 모드와 무관하게 항상 보이는 컬럼들 */
const BASE_COLUMNS: readonly ProjectColumnKey[] = [
  'name',
  'description',
  'status',
  'memberCount',
  'myRole',
  'createdAt',
  'updatedAt',
];

/**
 * 남는 폭을 흡수하는 컬럼.
 *
 * 설명만이 길이가 정해지지 않은 자유 텍스트다. 날짜나 멤버 수처럼 내용 길이가
 * 뻔한 컬럼을 넓혀 봐야 여백만 늘어난다.
 */
export const FLEX_COLUMN: ProjectColumnKey = 'description';

const ALL_COLUMNS = Object.keys(DEFAULT_COLUMN_WIDTHS) as ProjectColumnKey[];

/**
 * 실제로 렌더링할 컬럼 폭과 테이블 전체 폭을 구한다.
 *
 * @param stored         localStorage 에서 읽어 둔 사용자 조정 폭. 없는 키는 기본값으로 메운다
 * @param containerWidth 테이블을 감싼 요소의 폭. 아직 측정 전이면 0 을 넘긴다
 * @param adminMode      관리자 모드 여부. 꺼져 있으면 manage 컬럼이 렌더링되지 않는다
 *
 * containerWidth 가 합계보다 좁거나 아직 0 이면 남는 폭이 없으므로 합계를 그대로 돌려준다.
 * 이때는 기존과 똑같이 가로 스크롤이 생긴다. 측정 전(0)을 합계로 처리하는 이유는
 * 첫 렌더에서 테이블이 좁게 그려졌다가 넓어지며 덜컥거리는 것을 막기 위해서다.
 */
export function computeRenderedWidths(
  stored: Record<string, number>,
  containerWidth: number,
  adminMode: boolean,
): { widths: Record<ProjectColumnKey, number>; tableWidth: number } {
  const widths = {} as Record<ProjectColumnKey, number>;
  for (const key of ALL_COLUMNS) {
    const saved = stored[key];
    widths[key] =
      typeof saved === 'number' && Number.isFinite(saved) && saved > 0
        ? saved
        : DEFAULT_COLUMN_WIDTHS[key];
  }

  const visible: readonly ProjectColumnKey[] = adminMode
    ? [...BASE_COLUMNS, 'manage']
    : BASE_COLUMNS;
  const sum = visible.reduce((acc, key) => acc + widths[key], 0);

  const slack = containerWidth > sum ? containerWidth - sum : 0;
  widths[FLEX_COLUMN] += slack;

  return { widths, tableWidth: sum + slack };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm -F @sam/web exec vitest run src/lib/projectListColumns.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: 커밋한다**

```bash
git add apps/web/src/lib/projectListColumns.ts apps/web/src/lib/projectListColumns.test.ts
git commit -m "feat(web): 프로젝트 목록 컬럼 폭 분배 계산 추가

남는 폭을 설명 컬럼이 흡수하도록 하는 순수 함수. UI 연결은 다음 커밋.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 목록 화면 폭 상한 해제와 폭 계산 연결

**Files:**
- Modify: `apps/web/src/pages/ProjectsPage.tsx`

**Interfaces:**
- Consumes: Task 1 의 `DEFAULT_COLUMN_WIDTHS`, `computeRenderedWidths`
- Produces: 없음 (화면 변경만)

- [ ] **Step 1: import 와 상수를 바꾼다**

`ProjectsPage.tsx:1-8` 의 import 블록 아래에 추가한다.

```ts
import { DEFAULT_COLUMN_WIDTHS, computeRenderedWidths } from '../lib/projectListColumns';
```

`:1` 의 React import 에 `useCallback` 을 더한다.

```ts
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
```

`:16-29` 의 `STORAGE_KEY` 와 `defaultWidths` 블록을 통째로 아래로 바꾼다.

```ts
  // Local Storage 키 명칭
  //
  // v2 로 올린 이유: 관리 컬럼에 보관/복원 버튼이 늘면서 기본 폭을 140 → 180 으로 키웠는데,
  // 폭 상태를 { ...defaultWidths, ...parsed } 로 합치는 구조라 이미 저장된 140 이 새 기본값을
  // 덮어쓴다. 키를 올려 한 번만 초기화되게 했다. 옛 키는 읽지도 지우지도 않고 그냥 둔다.
  const STORAGE_KEY = 'sam_project_list_column_widths_v2';

  // 기본 컬럼 폭은 lib/projectListColumns.ts 가 단일 원본이다.
  const defaultWidths = DEFAULT_COLUMN_WIDTHS;
```

- [ ] **Step 2: 컨테이너 폭 측정과 렌더 폭 계산을 넣는다**

`:43` 의 `columnWidths` useState 블록 **바로 아래**에 다음을 넣는다 (드래그 핸들러보다 위여야 한다 — 핸들러가 `renderedWidths` 를 참조한다).

```ts
  // 테이블을 감싼 요소의 실제 폭. ResizeObserver 로 관찰한다.
  // 감싼 요소는 조건부로 렌더링되므로 useEffect + ref 대신 콜백 ref 로 붙인다.
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const attachTableWrap = useCallback((el: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    resizeObserverRef.current = ro;
  }, []);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  // 실제로 그릴 폭. 남는 폭은 설명 컬럼이 흡수한다.
  const { widths: renderedWidths, tableWidth } = useMemo(
    () => computeRenderedWidths(columnWidths, containerWidth, adminMode),
    [columnWidths, containerWidth, adminMode],
  );
```

- [ ] **Step 3: 드래그 시작 폭을 렌더 폭 기준으로 바꾼다**

`:55` 의 `startWidth.current` 대입을 바꾼다.

바꾸기 전:

```ts
    startWidth.current = columnWidths[columnKey] || defaultWidths[columnKey as keyof typeof defaultWidths];
```

바꾼 뒤:

```ts
    // 저장값이 아니라 화면에 실제로 그려진 폭에서 출발한다.
    // 설명 컬럼은 남는 폭이 얹혀 있어 저장값과 다르고, 저장값에서 출발하면
    // 드래그를 시작하는 순간 폭이 뚝 튄다.
    startWidth.current =
      renderedWidths[columnKey as keyof typeof renderedWidths] ??
      defaultWidths[columnKey as keyof typeof defaultWidths];
```

- [ ] **Step 4: 옛 `totalTableWidth` 계산을 지운다**

`:91-105` 의 주석 `// 테이블 전체 폭 계산` 부터 `}, [columnWidths, adminMode]);` 까지를 통째로 삭제한다. Step 2 의 `tableWidth` 가 대신한다.

- [ ] **Step 5: 컨테이너 클래스와 테이블 폭을 바꾼다**

`:221` 을 바꾼다.

```tsx
    <main className="px-3 py-6">
```

`:316` 의 감싼 `div` 에 콜백 ref 를 붙인다.

```tsx
          <div
            ref={attachTableWrap}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
```

`:319` 의 테이블 style 을 바꾼다.

```tsx
              style={{ tableLayout: 'fixed', width: `${tableWidth}px` }}
```

- [ ] **Step 6: 모든 셀 폭을 렌더 폭으로 갈아끼운다**

`ProjectsPage.tsx` 안에서 `columnWidths.` 로 시작하는 **style 속성 안의** 참조를 전부 `renderedWidths.` 로 바꾼다. 대상은 `<th>` 8곳(`:326`, `:342`, `:355`, `:371`, `:387`, `:403`, `:419`, `:438`)과 `<td>` 8곳(`:450`, `:458`, `:465`, `:471`, `:477`, `:484`, `:490`, `:497`)이다.

예 (`:326`):

```tsx
                    style={{ width: `${renderedWidths.name}px` }}
```

예 (`:450`):

```tsx
                      style={{ width: `${renderedWidths.name}px`, maxWidth: `${renderedWidths.name}px` }}
```

`handleMouseDown` / `handleMouseUp` / `setColumnWidths` 안의 `columnWidths` 는 **저장값**이므로 그대로 둔다.

- [ ] **Step 7: 타입 검사와 남은 참조 확인**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

Run: `git diff -U0 apps/web/src/pages/ProjectsPage.tsx | grep -n 'columnWidths'`
Expected: `style=` 안에 `columnWidths` 가 남아 있지 않다 (저장값을 다루는 상태·핸들러 줄만 보인다)

- [ ] **Step 8: 브라우저로 확인한다**

개발 서버를 띄운다 (이미 떠 있으면 생략).

Run: `pnpm dev`

`http://localhost:5173/projects` 에서 확인한다.

1. 창을 넓혔을 때 테이블 오른쪽 끝이 화면 끝(좌우 12px 여백)까지 닿는다
2. 창을 좁히면 가로 스크롤이 생기고 컬럼이 찌그러지지 않는다
3. 창 크기를 바꾸면 설명 컬럼만 따라 늘고 준다
4. 컬럼 경계를 끌면 폭이 튀지 않고 손을 따라온다
5. 새로고침해도 조정한 폭이 유지된다
6. 관리자 모드를 껐다 켜도 테이블이 화면을 채운다

> 화면이 하얗게 비면 vite 의 의존성 캐시 문제다. `rm -rf apps/web/node_modules/.vite && pnpm dev` (AGENTS.md 5.4). 이번 변경은 `@sam/shared` 에 새 export 를 더하지 않으므로 해당될 가능성은 낮다.

- [ ] **Step 9: 커밋한다**

```bash
git add apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): 프로젝트 목록 폭 상한 해제, 테이블이 화면을 채우게

max-w-7xl 을 없애고 좌우 패딩을 px-3 으로 줄였다. 남는 폭은 설명 컬럼이
흡수한다. 컬럼 폭 저장 키를 v2 로 올려 관리 컬럼 기본 폭(180)이 먹히게 했다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 명칭 편집 로직을 훅으로 분리

상세 화면의 겉모습과 동작을 **바꾸지 않는** 순수 리팩터링이다. 목록 셀(Task 4)이 같은 로직을 쓰기 위한 준비다.

**Files:**
- Create: `apps/web/src/lib/useProjectNameEdit.ts`
- Modify: `apps/web/src/components/ProjectNameEditor.tsx`

**Interfaces:**
- Consumes: 기존 `lib/projectName.ts`(`canSubmitProjectName`, `normalizeProjectName`, `PROJECT_NAME_MAX_LENGTH`), `lib/projects.ts`(`useUpdateProject`), `lib/errors.ts`(`apiErrorMessage`), `lib/toast.ts`(`toast`)
- Produces:
  - `interface ProjectNameTarget { id: string; name: string; updatedAt: string }`
  - `useProjectNameEdit(project: ProjectNameTarget): ProjectNameEdit`
  - `interface ProjectNameEdit { editing: boolean; draft: string; setDraft: (v: string) => void; inputRef: RefObject<HTMLInputElement>; canSubmit: boolean; pending: boolean; startEdit: () => void; cancelEdit: () => void; submit: () => Promise<void>; handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void }`

- [ ] **Step 1: 훅 파일을 만든다**

`apps/web/src/lib/useProjectNameEdit.ts` 를 새로 만든다. 내용은 현재 `ProjectNameEditor.tsx:25-74` 를 그대로 옮긴 것이다.

```ts
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useUpdateProject } from './projects';
import { apiErrorMessage } from './errors';
import { toast } from './toast';
import { canSubmitProjectName, normalizeProjectName } from './projectName';

/**
 * 프로젝트 명칭 인라인 편집 로직
 * (docs/superpowers/specs/2026-08-01-project-list-ui-design.md §5)
 *
 * 상세 화면 헤더(ProjectNameEditor)와 목록 셀(ProjectNameCell)이 겉모습만 다르고
 * 동작은 같아서, 로직을 여기로 내리고 껍데기를 둘로 나눴다.
 * 권한 판단은 하지 않는다. 호출부가 연필 버튼을 그릴지 말지 결정한다.
 */

/**
 * 편집에 필요한 최소 정보.
 *
 * ProjectDetail 과 ProjectListItem 양쪽이 이 세 필드를 모두 갖고 있어
 * (ProjectDetail = ProjectListItem.extend({ createdById }), packages/shared)
 * 두 화면이 같은 훅을 쓸 수 있다.
 */
export interface ProjectNameTarget {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectNameEdit {
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  canSubmit: boolean;
  pending: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  submit: () => Promise<void>;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function useProjectNameEdit(project: ProjectNameTarget): ProjectNameEdit {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateProject = useUpdateProject(project.id);

  // 편집 진입 시 자동 포커스 + 전체 선택
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(project.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(project.name);
  };

  const canSubmit = canSubmitProjectName(draft, project.name);

  const submit = async () => {
    if (!canSubmit || updateProject.isPending) return;
    try {
      await updateProject.mutateAsync({
        // 앞뒤 공백은 버리고 저장한다. 서버는 trim 하지 않는다.
        name: normalizeProjectName(draft),
        expectedUpdatedAt: project.updatedAt,
      });
      setEditing(false);
      toast.success('프로젝트 명칭이 변경되었습니다.');
    } catch (err) {
      // 409 를 포함해 실패 시에는 편집 모드를 유지한다. 방금 친 이름을 잃지 않게 하기 위함.
      // apiErrorMessage 가 409 를 CONFLICT 안내 문구로 바꿔 준다 (lib/errors.ts:36).
      toast.error(apiErrorMessage(err, '명칭 변경에 실패했습니다.'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    canSubmit,
    pending: updateProject.isPending,
    startEdit,
    cancelEdit,
    submit,
    handleKeyDown,
  };
}
```

- [ ] **Step 2: `ProjectNameEditor` 를 훅 소비자로 줄인다**

`apps/web/src/components/ProjectNameEditor.tsx` 를 아래로 통째로 바꾼다. **JSX 는 한 글자도 바뀌지 않는다** — 상태 변수 출처만 훅으로 옮겼다.

```tsx
import type { ProjectDetail } from '@sam/shared';
import { useProjectNameEdit } from '../lib/useProjectNameEdit';
import { PROJECT_NAME_MAX_LENGTH } from '../lib/projectName';

/**
 * 프로젝트 명칭 인라인 편집 — 상세 화면 헤더용.
 * 설계: docs/superpowers/specs/2026-08-01-project-rename-inline-design.md
 *
 * 편집 로직은 lib/useProjectNameEdit.ts 에 있다. 목록 셀(ProjectNameCell)과
 * 같은 로직을 쓰되 겉모습만 다르다.
 *
 * 권한 판단은 하지 않는다. 호출부가 `canRename` 으로 넘겨준다 (isAdmin && adminMode).
 */
export default function ProjectNameEditor({
  project,
  canRename,
}: {
  project: ProjectDetail;
  canRename: boolean;
}) {
  const edit = useProjectNameEdit(project);

  if (!edit.editing) {
    return (
      <span className="flex items-center gap-1.5">
        {canRename && (
          <button
            type="button"
            onClick={edit.startEdit}
            title="프로젝트 명칭 변경"
            aria-label="프로젝트 명칭 변경"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.5A2.25 2.25 0 0117.25 21H5.25A2.25 2.25 0 013 18.75V6.75A2.25 2.25 0 015.25 4.5h4.5" />
            </svg>
          </button>
        )}
        <span>{project.name}</span>
      </span>
    );
  }

  const pending = edit.pending;

  return (
    <span className="flex items-center gap-1.5">
      <input
        ref={edit.inputRef}
        type="text"
        value={edit.draft}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        disabled={pending}
        onChange={(e) => edit.setDraft(e.target.value)}
        onKeyDown={edit.handleKeyDown}
        aria-label="프로젝트 명칭"
        className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-lg font-bold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void edit.submit()}
        disabled={!edit.canSubmit || pending}
        title="확인"
        aria-label="명칭 변경 확인"
        className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {pending ? (
          <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={edit.cancelEdit}
        disabled={pending}
        title="취소"
        aria-label="명칭 변경 취소"
        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
```

- [ ] **Step 3: 타입 검사와 기존 테스트**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

Run: `pnpm -F @sam/web test`
Expected: PASS — `projectName.test.ts` 와 `projectListColumns.test.ts` 를 포함해 전부 통과

- [ ] **Step 4: 상세 화면 회귀를 브라우저로 확인한다**

`http://localhost:5173/projects/<프로젝트 id>` 에서, 리팩터링 전과 똑같이 동작하는지 본다.

1. ADMIN + 관리자 모드 ON → 이름 왼쪽에 연필 버튼이 보인다
2. 연필 클릭 → 입력창이 열리고 텍스트가 전체 선택된 채 포커스된다
3. 이름을 고치고 Enter → 저장되고 성공 토스트
4. Esc → 원래 이름으로 돌아온다
5. 이름을 지워 비우면 체크 버튼이 흐려진다
6. 관리자 모드 OFF → 연필이 사라진다

- [ ] **Step 5: 커밋한다**

```bash
git add apps/web/src/lib/useProjectNameEdit.ts apps/web/src/components/ProjectNameEditor.tsx
git commit -m "refactor(web): 명칭 인라인 편집 로직을 useProjectNameEdit 훅으로 분리

목록 셀이 같은 로직을 쓰기 위한 준비. 상세 화면의 겉모습과 동작은 그대로다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 목록 셀 인라인 편집

**Files:**
- Create: `apps/web/src/components/ProjectNameCell.tsx`
- Modify: `apps/web/src/pages/ProjectsPage.tsx`

**Interfaces:**
- Consumes: Task 3 의 `useProjectNameEdit`
- Produces: `ProjectNameCell` 컴포넌트 — `props: { project: ProjectListItem; canRename: boolean }` (default export)

- [ ] **Step 1: 셀 컴포넌트를 만든다**

`apps/web/src/components/ProjectNameCell.tsx` 를 새로 만든다.

```tsx
import { Link } from 'react-router-dom';
import type { ProjectListItem } from '@sam/shared';
import { useProjectNameEdit } from '../lib/useProjectNameEdit';
import { PROJECT_NAME_MAX_LENGTH } from '../lib/projectName';

/**
 * 프로젝트 목록의 이름 셀. 보기 모드에서는 상세 화면 링크이고,
 * 연필 버튼을 누르면 그 자리가 입력창으로 바뀐다.
 * 설계: docs/superpowers/specs/2026-08-01-project-list-ui-design.md §5.3
 *
 * 편집 로직은 상세 화면 헤더(ProjectNameEditor)와 같은 훅을 쓴다.
 * 권한 판단은 하지 않는다. 호출부가 `canRename` 으로 넘겨준다.
 */
export default function ProjectNameCell({
  project,
  canRename,
}: {
  project: ProjectListItem;
  canRename: boolean;
}) {
  const edit = useProjectNameEdit(project);

  if (!edit.editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Link
          to={`/projects/${project.id}`}
          className="block truncate text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
          title={project.name}
        >
          {project.name}
        </Link>
        {canRename && (
          <button
            type="button"
            onClick={(e) => {
              // 셀 전체가 상세 화면으로 가는 링크 영역이라, 막지 않으면
              // 편집을 시작하려다 페이지가 넘어간다.
              e.preventDefault();
              e.stopPropagation();
              edit.startEdit();
            }}
            title="프로젝트 명칭 변경"
            aria-label="프로젝트 명칭 변경"
            // 행에 마우스를 올렸을 때만 보인다. focus: 를 같이 주는 이유는
            // 키보드로 탭 이동할 때 보이지 않는 버튼에 포커스가 갇히지 않게 하기 위해서다.
            className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover/row:opacity-100 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.5A2.25 2.25 0 0117.25 21H5.25A2.25 2.25 0 013 18.75V6.75A2.25 2.25 0 015.25 4.5h4.5" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  const pending = edit.pending;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        ref={edit.inputRef}
        type="text"
        value={edit.draft}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        disabled={pending}
        onChange={(e) => edit.setDraft(e.target.value)}
        onKeyDown={edit.handleKeyDown}
        aria-label="프로젝트 명칭"
        className="w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void edit.submit()}
        disabled={!edit.canSubmit || pending}
        title="확인"
        aria-label="명칭 변경 확인"
        className="shrink-0 rounded p-0.5 text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40"
      >
        {pending ? (
          <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={edit.cancelEdit}
        disabled={pending}
        title="취소"
        aria-label="명칭 변경 취소"
        className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 목록에 연결한다**

`ProjectsPage.tsx` 의 import 에 추가한다.

```ts
import ProjectNameCell from '../components/ProjectNameCell';
```

`:447` 의 `<tr>` 에 이름 붙인 group 을 더한다. 헤더의 `group/th` 와 섞이지 않게 `group/row` 로 짓는다.

```tsx
                  <tr key={p.id} className="group/row hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
```

`:448-455` 의 이름 `<td>` 를 바꾼다. `whitespace-nowrap` 을 뺀 이유는 편집 모드의 입력창이 셀 폭에 맞게 늘어나야 하기 때문이다 — 자르기는 `ProjectNameCell` 안의 `truncate` 가 맡는다.

```tsx
                    <td
                      className="px-4 py-4 font-semibold text-slate-950 dark:text-slate-50"
                      style={{ width: `${renderedWidths.name}px`, maxWidth: `${renderedWidths.name}px` }}
                    >
                      <ProjectNameCell project={p} canRename={canRename} />
                    </td>
```

`:122` 의 `canCreate` 바로 아래에 `canRename` 을 더한다. 같은 조건이지만 이름을 따로 두어 호출부에서 무엇을 판단한 것인지 드러나게 한다.

```ts
  const canRename = me.data?.globalRole === 'ADMIN' && adminMode;
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

- [ ] **Step 4: 브라우저로 확인한다**

`http://localhost:5173/projects` 에서 확인한다.

1. 관리자 모드 ON → 행에 마우스를 올리면 이름 오른쪽에 연필이 나타난다. 안 올리면 안 보인다
2. 연필 클릭 → 상세 화면으로 **넘어가지 않고** 입력창이 열린다
3. 이름 클릭 → 상세 화면으로 넘어간다 (기존 동작 유지)
4. 이름을 고치고 Enter → 저장되고 목록의 이름이 바뀐다. 상세 화면에도 반영된다
5. Esc / X → 원래 이름으로 돌아온다
6. 이름이 긴 프로젝트 → 보기 모드에서 `…` 로 잘리고, 편집 모드에서는 입력창이 셀에 꽉 찬다
7. 관리자 모드 OFF, 일반 USER 로 로그인 → 연필이 없다
8. 다른 탭에서 먼저 이름을 바꾼 뒤 저장 → 409 토스트가 뜨고 편집 모드가 유지된다

- [ ] **Step 5: 커밋한다**

```bash
git add apps/web/src/components/ProjectNameCell.tsx apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): 프로젝트 목록에서 명칭 인라인 편집

행 hover 시 나타나는 연필 버튼으로 그 자리에서 이름을 고친다.
ADMIN + 관리자 모드에서만 보인다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 목록에서 보관 / 복원

**Files:**
- Create: `apps/web/src/components/ProjectArchiveButton.tsx`
- Modify: `apps/web/src/pages/ProjectsPage.tsx`

**Interfaces:**
- Consumes: 기존 `lib/projects.ts`(`useUpdateProject`), `lib/errors.ts`(`apiErrorMessage`), `lib/toast.ts`(`toast`)
- Produces: `ProjectArchiveButton` 컴포넌트 — `props: { project: ProjectListItem }` (default export)

- [ ] **Step 1: 버튼 컴포넌트를 만든다**

`apps/web/src/components/ProjectArchiveButton.tsx` 를 새로 만든다.

```tsx
import type { ProjectListItem } from '@sam/shared';
import { useUpdateProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

/**
 * 프로젝트 목록 행의 보관 / 복원 버튼.
 * 설계: docs/superpowers/specs/2026-08-01-project-list-ui-design.md §6
 *
 * 행 단위 컴포넌트인 이유는 useUpdateProject 가 훅이라 map() 안에서 부를 수 없기 때문이다.
 *
 * 권한 판단은 하지 않는다. 이 버튼이 들어가는 '관리' 컬럼 자체가
 * 관리자 모드에서만 렌더링된다 (ProjectsPage).
 */
export default function ProjectArchiveButton({ project }: { project: ProjectListItem }) {
  const updateProject = useUpdateProject(project.id);
  const archived = project.status === 'ARCHIVED';

  async function toggle() {
    if (updateProject.isPending) return;

    // 보관만 확인을 받는다. 복원은 그 자체가 되돌리는 동작이라 잘못 눌러도 손해가 없다.
    if (!archived) {
      const ok = window.confirm(
        `'${project.name}' 을(를) 보관 처리합니다.\n\n` +
          "보관된 프로젝트도 목록의 '복원' 버튼으로 언제든 다시 활성 상태로 되돌릴 수 있습니다.",
      );
      if (!ok) return;
    }

    try {
      await updateProject.mutateAsync({
        status: archived ? 'ACTIVE' : 'ARCHIVED',
        expectedUpdatedAt: project.updatedAt,
      });
      toast.success(archived ? '복원되었습니다.' : '보관 처리되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const pending = updateProject.isPending;

  // 색은 상세 화면의 보관(amber) / 복원(emerald) 버튼과 맞춘다.
  // 다만 같은 칸의 복제·삭제와 모양을 맞춰 아이콘이 아니라 글자 배지로 만든다.
  const cls = archived
    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/60'
    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/60';

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      title={archived ? '프로젝트를 활성 상태로 복원' : '프로젝트 보관 처리'}
      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      {pending ? '…' : archived ? '복원' : '보관'}
    </button>
  );
}
```

- [ ] **Step 2: 관리 컬럼에 넣는다**

`ProjectsPage.tsx` 의 import 에 추가한다.

```ts
import ProjectArchiveButton from '../components/ProjectArchiveButton';
```

관리 셀의 버튼 묶음(`:499` 의 `<div className="flex items-center justify-center gap-1.5">`) **맨 앞**에 넣는다. 복제 `<Link>` 보다 위다.

```tsx
                        <div className="flex items-center justify-center gap-1.5">
                          <ProjectArchiveButton project={p} />
                          <Link
                            to={`/projects/${p.id}/clone`}
```

- [ ] **Step 3: 페이지 번호 clamp 를 넣는다**

`:199` 의 `paginated` useMemo **바로 아래**에 넣는다.

```ts
  // 마지막 페이지의 마지막 항목을 보관(또는 삭제)하면 그 행이 목록에서 빠지면서
  // currentPage 가 totalPages 를 넘어 빈 표가 남는다. 이때 마지막 페이지로 당긴다.
  // totalPages 가 0 이면 건드리지 않는다 — 결과가 없을 때는 페이징 컨트롤 자체가 숨겨지고
  // "조건에 부합하는 프로젝트가 없습니다" 안내가 대신 뜬다.
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
```

- [ ] **Step 4: 타입 검사와 테스트**

Run: `pnpm -F @sam/web typecheck`
Expected: 에러 없음

Run: `pnpm -F @sam/web test`
Expected: PASS — 전부 통과

- [ ] **Step 5: 브라우저로 확인한다**

`http://localhost:5173/projects` 에서 관리자 모드를 켜고 확인한다.

1. 활성 프로젝트 행 → 관리 칸에 `보관` `복제` (amber + sky)
2. `보관` 클릭 → 프로젝트 이름이 들어간 확인 창. `취소` 하면 아무 일도 안 일어난다
3. `확인` → 상태 배지가 `보관` 으로 바뀌고 토스트가 뜬다
4. 상태 필터가 `활성` 이면 보관한 행이 목록에서 사라진다
5. 보관된 프로젝트 행 → 관리 칸에 `복원` `복제` `삭제` 세 개가 잘리지 않고 들어간다
6. `복원` 클릭 → 확인 창 없이 바로 활성으로 돌아온다
7. 마지막 페이지에 항목이 하나뿐일 때 그것을 보관 → 빈 표가 아니라 이전 페이지가 보인다
8. 다른 탭에서 먼저 상태를 바꾼 뒤 보관 → 409 토스트

- [ ] **Step 6: 커밋한다**

```bash
git add apps/web/src/components/ProjectArchiveButton.tsx apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): 프로젝트 목록에서 보관/복원

관리 칸에 상태에 따라 보관 또는 복원 버튼을 둔다. 보관만 확인을 받고
복원은 즉시 실행한다. 마지막 항목을 보관했을 때 빈 페이지가 남던 것도 고쳤다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증

**Files:**
- Modify: 없음 (검증 중 문제를 찾으면 해당 태스크의 파일을 고친다)

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 없음

- [ ] **Step 1: 워크스페이스 전체 타입 검사**

Run: `pnpm -r typecheck`
Expected: 모든 패키지 에러 없음 (AGENTS.md 4.1)

- [ ] **Step 2: 웹 테스트 전체**

Run: `pnpm -F @sam/web test`
Expected: PASS. `projectName.test.ts`(11개)와 새 `projectListColumns.test.ts`(11개)를 포함해 전부 통과

- [ ] **Step 3: 프로덕션 빌드**

Run: `pnpm -F @sam/web build`
Expected: 성공. `tsc -b` 와 `vite build` 모두 통과

- [ ] **Step 4: 설계 문서의 수동 검증 항목을 훑는다**

`docs/superpowers/specs/2026-08-01-project-list-ui-design.md` §8 의 13개 항목을 브라우저에서 순서대로 확인한다. 특히 다음 두 가지가 회귀 위험이 큰 지점이다.

- 13번: **상세 화면의 이름 편집** — Task 3 리팩터링의 회귀 확인
- 5번: **일반 USER 로 로그인했을 때** 목록이 예전과 똑같은지 (연필 없음, 관리 칸 없음, 테이블은 화면을 채움)

- [ ] **Step 5: 브랜치 상태 확인**

Run: `git status`
Expected: working tree clean

Run: `git log --oneline master..HEAD`
Expected: 설계 문서 1개 + 구현 5개 = 6개 커밋

- [ ] **Step 6: 계획 문서를 커밋한다**

```bash
git add docs/superpowers/plans/2026-08-01-project-list-ui.md
git commit -m "docs(plan): 프로젝트 목록 화면 개선 구현 계획

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 검증 요약

| 명령 | 언제 |
| --- | --- |
| `pnpm -F @sam/web exec vitest run src/lib/projectListColumns.test.ts` | Task 1 |
| `pnpm -F @sam/web typecheck` | Task 2, 3, 4, 5 |
| `pnpm -F @sam/web test` | Task 3, 5 |
| `pnpm -r typecheck` | Task 6 |
| `pnpm -F @sam/web build` | Task 6 |

DB 변경 없음 — 사용자에게 스키마 변경을 알릴 사항이 없다 (AGENTS.md 7).
