# Delay Threshold Constants & Tooltip Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract delay status percentage thresholds into shared global constants, add a dynamic tooltip generator function that displays "마감일 경과 항목이 존재합니다." when `delayGap` is below the threshold for CRITICAL status, and unify all UI status displays to use `%` instead of `%p`.

**Architecture:** Define `DELAY_THRESHOLDS` and `getDelayStatusTooltip` in `@sam/shared` (`packages/shared/src/expected-progress.ts`), export them, and update `@sam/web` badge and UI components (`DelayStatusBadge.tsx`, `Timeline.tsx`, `ProgressBarWithExpected.tsx`, etc.) to use the new constants and utility function.

**Tech Stack:** TypeScript, React, Vitest/Jest, pnpm monorepo (@sam/shared, @sam/web)

## Global Constraints
- Node floor: Node 22.x
- Package manager: pnpm
- Data validation & Constants: Must live in `packages/shared`
- UI Labeling: Replace `%p` with `%` across all delay gap text displays

---

### Task 1: Define Delay Threshold Constants and Dynamic Tooltip Utility in `@sam/shared`

**Files:**
- Modify: `packages/shared/src/expected-progress.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/expected-progress.test.ts`

**Interfaces:**
- Consumes: `DelayStatus` enum from `@sam/shared`
- Produces: `DELAY_THRESHOLDS`, `DELAY_THRESHOLD_CRITICAL`, `DELAY_THRESHOLD_WARNING`, `DELAY_THRESHOLD_SLIGHT`, `getDelayStatusTooltip(status: DelayStatus, delayGap?: number): string`

- [ ] **Step 1: Write the failing tests in `packages/shared/src/expected-progress.test.ts`**

```typescript
// Add tests for DELAY_THRESHOLDS and getDelayStatusTooltip
describe('DELAY_THRESHOLDS & getDelayStatusTooltip', () => {
  it('should export correct threshold constants', () => {
    expect(DELAY_THRESHOLDS.CRITICAL).toBe(30);
    expect(DELAY_THRESHOLDS.WARNING).toBe(15);
    expect(DELAY_THRESHOLDS.SLIGHT).toBe(0);
  });

  it('should return overdue message for CRITICAL when delayGap < 30', () => {
    const tooltip = getDelayStatusTooltip('CRITICAL', 29);
    expect(tooltip).toBe('마감일 경과 항목이 존재합니다. (29% 지연)');
  });

  it('should return standard 30% message for CRITICAL when delayGap >= 30', () => {
    const tooltip = getDelayStatusTooltip('CRITICAL', 35);
    expect(tooltip).toBe('예상보다 30% 이상 심각하게 지연 중입니다. (35% 지연)');
  });

  it('should return warning message for WARNING status', () => {
    const tooltip = getDelayStatusTooltip('WARNING', 20);
    expect(tooltip).toBe('예상보다 15% 이상 지연 중입니다. (20% 지연)');
  });

  it('should return slight message for SLIGHT status', () => {
    const tooltip = getDelayStatusTooltip('SLIGHT', 5);
    expect(tooltip).toBe('예상보다 소폭 지연 중입니다. (5% 지연)');
  });

  it('should return on-track message for ON_TRACK status', () => {
    const tooltip = getDelayStatusTooltip('ON_TRACK');
    expect(tooltip).toBe('예상 일정대로 정상 진행 중입니다.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @sam/shared test`
Expected: FAIL with "DELAY_THRESHOLDS is not defined" / "getDelayStatusTooltip is not defined"

- [ ] **Step 3: Implement `DELAY_THRESHOLDS` and `getDelayStatusTooltip` in `packages/shared/src/expected-progress.ts`**

```typescript
export const DELAY_THRESHOLDS = {
  CRITICAL: 30,
  WARNING: 15,
  SLIGHT: 0,
} as const;

export const DELAY_THRESHOLD_CRITICAL = DELAY_THRESHOLDS.CRITICAL;
export const DELAY_THRESHOLD_WARNING = DELAY_THRESHOLDS.WARNING;
export const DELAY_THRESHOLD_SLIGHT = DELAY_THRESHOLDS.SLIGHT;

export function getDelayStatusTooltip(status: DelayStatus, delayGap?: number): string {
  const gapText = delayGap !== undefined && delayGap > 0 ? ` (${delayGap}% 지연)` : '';

  switch (status) {
    case 'CRITICAL':
      if (delayGap !== undefined && delayGap < DELAY_THRESHOLDS.CRITICAL) {
        return `마감일 경과 항목이 존재합니다.${gapText}`;
      }
      return `예상보다 ${DELAY_THRESHOLDS.CRITICAL}% 이상 심각하게 지연 중입니다.${gapText}`;

    case 'WARNING':
      if (delayGap !== undefined && delayGap < DELAY_THRESHOLDS.WARNING) {
        return `예상보다 지연 중입니다.${gapText}`;
      }
      return `예상보다 ${DELAY_THRESHOLDS.WARNING}% 이상 지연 중입니다.${gapText}`;

    case 'SLIGHT':
      return `예상보다 소폭 지연 중입니다.${gapText}`;

    case 'ON_TRACK':
    default:
      return '예상 일정대로 정상 진행 중입니다.';
  }
}
```

Update hardcoded numbers `30` and `15` in `getItemNodeDelayInfo` to use `DELAY_THRESHOLDS.CRITICAL` and `DELAY_THRESHOLDS.WARNING`.
Ensure `packages/shared/src/index.ts` exports `DELAY_THRESHOLDS`, `DELAY_THRESHOLD_CRITICAL`, `DELAY_THRESHOLD_WARNING`, `DELAY_THRESHOLD_SLIGHT`, and `getDelayStatusTooltip`.

- [ ] **Step 4: Run test to verify it passes & build shared package**

Run: `pnpm -F @sam/shared test`
Expected: PASS

Run: `pnpm -F @sam/shared build`
Expected: Build succeeds without errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/expected-progress.ts packages/shared/src/expected-progress.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): export DELAY_THRESHOLDS constants and getDelayStatusTooltip utility"
```

---

### Task 2: Update Web Components to Use Shared Tooltip Utility and `%` Notation

**Files:**
- Modify: `apps/web/src/components/DelayStatusBadge.tsx`
- Modify: `apps/web/src/components/ProgressBarWithExpected.tsx`
- Modify: `apps/web/src/components/Timeline.tsx`
- Modify: `apps/web/src/pages/UserGuidePage.tsx`

**Interfaces:**
- Consumes: `getDelayStatusTooltip`, `DELAY_THRESHOLDS` from `@sam/shared`

- [ ] **Step 1: Update `DelayStatusBadge.tsx`**

Import `getDelayStatusTooltip` from `@sam/shared`.
Update `%p` to `%` in `gapText`:
```typescript
const gapText = delayGap !== undefined && delayGap > 0 ? `${delayGap}% 지연` : '';
```

Replace hardcoded `title="..."` props with `title={getDelayStatusTooltip(status, delayGap)}`:
```tsx
case 'CRITICAL':
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 ${sizeClasses} ${className}`}
      title={getDelayStatusTooltip('CRITICAL', delayGap)}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
      </span>
      <span>🚨 {showDetails && gapText ? `지연 (${gapText})` : '심각 지연'}</span>
    </span>
  );
```
Do the same for `WARNING`, `SLIGHT`, and `ON_TRACK`.

- [ ] **Step 2: Update `ProgressBarWithExpected.tsx`, `Timeline.tsx`, and `UserGuidePage.tsx`**

In `ProgressBarWithExpected.tsx`:
Change `(${expectedProgress! - actual}%p 지연)` to `(${expectedProgress! - actual}% 지연)`.

In `Timeline.tsx`:
Replace hardcoded `title={`🚨 예상보다 ${delayInfo.delayGap}%p 심각하게 지연 중`}` with `title={getDelayStatusTooltip(delayInfo.status, delayInfo.delayGap)}`.
Change `%p` to `%` in delayGap tooltip strings.

In `UserGuidePage.tsx`:
Update User Guide descriptions replacing `%p` with `%` where applicable.

- [ ] **Step 3: Clear Vite cache & Typecheck**

Run: `rm -rf apps/web/node_modules/.vite && pnpm -r typecheck`
Expected: PASS with 0 type errors.

- [ ] **Step 4: Verify in Dev Server**

Run: `pnpm dev`
Check UI: Verify `🚨 지연 (29% 지연)` badge tooltip shows `"마감일 경과 항목이 존재합니다. (29% 지연)"` when hovered.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/DelayStatusBadge.tsx apps/web/src/components/ProgressBarWithExpected.tsx apps/web/src/components/Timeline.tsx apps/web/src/pages/UserGuidePage.tsx
git commit -m "fix(web): use getDelayStatusTooltip and replace %p with % across UI components"
```
