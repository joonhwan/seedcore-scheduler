# 설계서: 영업일(주말 제외) 기준 예상 진척율 계산

## 1. 개요 및 배경
기존 달력일수(Calendar Days) 기준의 예상 진척율 계산 방식을 **영업일(Working Days / 주말 제외)** 기준으로 갱신합니다.
실제 프로젝트 환경에서는 토요일과 일요일에 작업이 진행되지 않으므로, 주말 동안 예상 진척율이 계속 상승하여 월요일 아침에 허위 지연(Delay Warning/Critical) 경고가 발생하는 현상을 방지합니다.

---

## 2. 상세 알고리즘 및 수학적 명세

### 2.1 영업일 산출 함수 (`countWorkingDays`)
`fromIso` (시작일, 포함)부터 `toIso` (종료일/기준일, 미포함) 사이의 날짜 중 **토요일(Day 6)과 일요일(Day 0)**을 제외한 평일 수(Working Days)를 카운트합니다.

```typescript
export function countWorkingDays(fromIso: string, toIso: string): number {
  if (fromIso >= toIso) return 0;

  let current = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  let count = 0;

  while (current < end) {
    const dayOfWeek = current.getUTCDay(); // 0: 일요일, 6: 토요일
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}
```

### 2.2 예상 진척율 계산 로직 (`calculateExpectedProgress`)
1. `todayIso < startAt`: `0%` 반환
2. `todayIso >= endAt`: `100%` 반환
3. `totalWorkingDays` = `countWorkingDays(startAt, endAt)`
4. `elapsedWorkingDays` = `countWorkingDays(startAt, todayIso)`
5. 진척율 산출:
   - `totalWorkingDays > 0` 인 경우:
     `Math.max(0, Math.min(100, Math.round((elapsedWorkingDays / totalWorkingDays) * 100)))`
   - `totalWorkingDays === 0` (시작일과 종료일이 모두 주말인 경우 등):
     기존 달력일수(Calendar Days) 방식으로 안전하게 fallback 계산.

---

## 3. 주말 동작 특징 및 예시
- **금요일(8/7) ~ 다음 주 화요일(8/11)** 일정 (총 3영업일: 금, 월, 화):
  - **금요일(8/7) 조회**: `0 / 3 = 0%`
  - **토요일(8/8) / 일요일(8/9) 조회**: 금요일 1일분 작업 경과 후 주말이므로 **`1 / 3 = 33%` 동결 유지**
  - **월요일(8/10) 조회**: `1 / 3 = 33%`
  - **화요일(8/11) 조회**: `2 / 3 = 67%`
  - **수요일(8/12) 이후**: `100%`

---

## 4. 관련 시스템 및 문서 갱신
1. `@sam/shared`: `expected-progress.ts` 및 `expected-progress.test.ts`
2. 웹 UI: `UserGuidePage.tsx` 사용설명서의 진척율 산출 원리 섹션 갱신
3. 프로젝트 문서: `HANDOFF.md`, `DESIGN.md` 기술 명세 갱신
