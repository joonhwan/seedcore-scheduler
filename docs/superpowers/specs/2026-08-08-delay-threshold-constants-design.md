# Design Spec: 지연 판단 전역 상수화 및 동적 툴팁 개선

## 1. 개요 (Overview)
현재 일정 지연 상태(CRITICAL, WARNING, SLIGHT) 판단 시 사용되는 % 기준값(30, 15 등)이 여러 컴포넌트에 하드코딩되어 있습니다. 또한, 지연율(`delayGap`)이 30%p 미만이더라도 **마감일 경과**나 **하위 일정 지연 전파**로 인해 `CRITICAL` 상태가 된 경우, 툴팁에 고정적으로 `"예상보다 30%p 이상 심각하게 지연 중입니다"`가 표시되는 모순이 존재합니다.

본 설계는 지연 판단 임계값 % 숫자를 전역 상수로 추출하여 패키지 전반에서 재사용할 수 있도록 하고, `CRITICAL` 상태에서 `delayGap`이 임계값(30%p)보다 작은 경우 `"마감일 경과 항목이 존재합니다."` 문구로 적절히 표시하도록 개선합니다.

---

## 2. 주요 변경 사항 (Key Changes)

### 2.1. 전역 상수 선언 (`packages/shared/src/expected-progress.ts`)
지연 임계값 상수를 단일 정의 지점(Single Source of Truth)으로 내보냅니다:

```typescript
export const DELAY_THRESHOLDS = {
  CRITICAL: 30, // 30%p 이상 지연 시 심각 지연
  WARNING: 15,  // 15%p 이상 지연 시 주의 지연
  SLIGHT: 0,    // 0%p 초과 지연 시 소폭 지연
} as const;

export const DELAY_THRESHOLD_CRITICAL = DELAY_THRESHOLDS.CRITICAL;
export const DELAY_THRESHOLD_WARNING = DELAY_THRESHOLDS.WARNING;
export const DELAY_THRESHOLD_SLIGHT = DELAY_THRESHOLDS.SLIGHT;
```

### 2.2. 동적 툴팁 유틸리티 함수 추가 (`packages/shared/src/expected-progress.ts`)
지연 상태(`status`)와 지연율(`delayGap`)을 인자로 받아 적절한 툴팁 문구를 생성하는 `getDelayStatusTooltip` 유틸리티 함수를 정의합니다 (표기 시 `%p` 대신 `%` 사용):

```typescript
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

### 2.3. 기존 판단 로직 및 툴팁 문구 상수 연동 & `%p` -> `%` 표기 일원화
1. **`packages/shared/src/expected-progress.ts`**:
   - `getItemNodeDelayInfo` 및 `calculateExpectedProgress` 등에서 직접 사용된 숫자 `30`, `15`를 `DELAY_THRESHOLDS.CRITICAL`, `DELAY_THRESHOLDS.WARNING`으로 교체.
2. **`apps/web/src/components/DelayStatusBadge.tsx`**:
   - `%p` 표기를 `%`로 변경 (`${delayGap}% 지연`)
   - 하드코딩된 `title` 문구를 `getDelayStatusTooltip(status, delayGap)`으로 교체.
3. **`apps/web/src/components/Timeline.tsx`, `ProgressBarWithExpected.tsx`, `UserGuidePage.tsx`**:
   - UI 상 표시되는 지연 수치 문구를 `%p`에서 `%`로 일관되게 수정.

---

## 3. 검증 계획 (Verification Plan)
1. **단위 테스트 (`packages/shared/src/expected-progress.test.ts`)**:
   - `getDelayStatusTooltip` 함수에 대한 테스트 작성:
     - `CRITICAL` & `delayGap = 29` -> `"마감일 경과 항목이 존재합니다. (29% 지연)"`
     - `CRITICAL` & `delayGap = 35` -> `"예상보다 30% 이상 심각하게 지연 중입니다. (35% 지연)"`
     - `WARNING` & `delayGap = 20` -> `"예상보다 15% 이상 지연 중입니다. (20% 지연)"`
2. **패키지 빌드 및 타입 체크**:
   - `pnpm -F @sam/shared build`
   - `pnpm -r typecheck`
3. **UI 렌더링 확인**:
   - 29% 지연 상태의 심각 지연 배지 호버 시 툴팁 문구 정상 출력 확인.
