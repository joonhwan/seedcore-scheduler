# 간트 차트 항목 바 내 예상 진척율 세로선 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 간트 차트 항목 사각형 바(Task Bar) 영역 내에 현재 날짜 기준 예상 진척율(Expected Progress Rate)을 세로선(Indicator Line)으로 시각화하여 실제 진행률과의 격차를 직관적으로 파악할 수 있도록 합니다.

**Architecture:** 기존 `@sam/shared`에 구현된 `getNodeDelayInfo` 및 `calculateExpectedProgress` 함수를 활용해 `expectedProgress`(0~100)를 구하고, `Timeline.tsx` 및 `GanttExportView.tsx` 사각형 바 영역 내부에 `left: ${expectedProgress}%` 위치의 absolute 세로선을 추가합니다.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

## Global Constraints

- **언어**: 모든 설명, 커밋 메시지, 주석 등은 한국어로 작성
- **cd 명령 금지**: 터미널 실행 시 Cwd 파라미터 사용
- **주석 보존**: 기존 인라인 주석 및 docstring 변경 금지

---

### Task 1: `Timeline.tsx` 간트 차트 바 내 예상 진척율 세로선 추가

**Files:**
- Modify: `apps/web/src/components/Timeline.tsx`

**Interfaces:**
- Consumes: `delayInfo.expectedProgress` (`getNodeDelayInfo` 결과)
- Produces: 간트 바 내 `expectedProgress` 지점 세로선 UI

- [ ] **Step 1: `Timeline.tsx` `Row` 컴포넌트의 간트 바 내부 세로선 JSX 추가**

`Timeline.tsx` 파일에서 사각형 바 `button` 요소 내부, 진행률 채움 `div` 다음 순서에 세로선 렌더링 코드 추가:

```tsx
{/* 예상 진척율 세로선 (Expected Progress Line) */}
{delayInfo.expectedProgress !== null && (
  <div
    className={`absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none ${
      isCritical || isWarning
        ? 'bg-amber-500 dark:bg-amber-400 shadow-sm'
        : 'bg-slate-800/70 dark:bg-slate-100/80'
    }`}
    style={{ left: `${delayInfo.expectedProgress}%` }}
    title={`예상 진척율: ${delayInfo.expectedProgress}%`}
  />
)}
```

- [ ] **Step 2: 타입체크 수행**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없이 성공 (0 errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Timeline.tsx
git commit -m "feat(web): 간트 차트 바 내 예상 진척율 세로선 UI 구현"
```

---

### Task 2: `GanttExportView.tsx` 내보내기 뷰 내 예상 진척율 세로선 추가

**Files:**
- Modify: `apps/web/src/components/GanttExportView.tsx`

**Interfaces:**
- Consumes: `@sam/shared`의 `calculateExpectedProgress`, `getTodayIso`
- Produces: 내보내기용 간트 차트 내 예상 진척율 세로선

- [ ] **Step 1: `GanttExportView.tsx`에 `calculateExpectedProgress`, `getTodayIso` 임포트 및 세로선 인라인 스타일 렌더링 추가**

```tsx
import { calculateExpectedProgress, getTodayIso, type NodeTreeItem } from '@sam/shared';
```

그리고 바 `div` 내부:

```tsx
{(() => {
  const expected = calculateExpectedProgress(start, end, getTodayIso());
  if (expected === null) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${expected}%`,
        width: 2,
        background: theme === 'dark' ? '#f8fafc' : '#1e293b',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    />
  );
})()}
```

- [ ] **Step 2: 타입체크 수행**

Run: `pnpm -F @sam/web typecheck`
Expected: 오류 없이 성공 (0 errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/GanttExportView.tsx
git commit -m "feat(web): 간트 이미지 내보내기 뷰에 예상 진척율 세로선 반영"
```

---

### Task 3: 전체 프로젝트 검증 및 통합 확인

- [ ] **Step 1: 전체 워크스페이스 타입체크 및 테스트 실행**

Run: `pnpm -r typecheck`
Expected: All workspaces pass.

- [ ] **Step 2: Final Commit (필요 시)**
