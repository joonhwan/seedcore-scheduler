# 간트 차트 항목 바 내 예상 진척율 세로선 표시 설계서

- **작성일**: 2026-08-04
- **상태**: 승인 대기 / 설계 완료

---

## 1. 개요

간트 차트(Timeline View)의 각 일정 항목 사각형 바(Task Bar) 영역 내에 오늘 날짜 기준 **예상 진척율(Expected Progress Rate)** 위치를 세로선(Indicator Line)으로 시각화합니다. 사용자는 실제 진행률(`progress`) 채움 바와 예상 진척율 세로선의 위치를 한눈에 비교하여 일정이 지연되고 있는지, 정상 진행 중인지 즉시 파악할 수 있습니다.

---

## 2. 요구사항 및 목표

1. **직관적인 일정 상태 시각화**:
   - 실제 진행률 채움 바가 예상 진척율 세로선보다 왼쪽에 위치 ➔ **지연 발생**
   - 실제 진행률 채움 바가 예상 진척율 세로선에 도달하거나 우측 위치 ➔ **정상/선행**
2. **기존 엔진 활용**:
   - `@sam/shared`의 `getNodeDelayInfo` 및 `calculateExpectedProgress`에서 이미 실시간으로 계산 중인 `expectedProgress` (0~100%) 값 활용.
3. **내보내기(Export) 호환성**:
   - 간트 차트 이미지 내보내기(`GanttExportView.tsx`) 시에도 예상 진척율 세로선이 동일하게 표현되도록 구현.

---

## 3. 세부 구현 사양

### 3.1 컴포넌트 변경사항

#### 1) `apps/web/src/components/Timeline.tsx` (`Row` 컴포넌트)
- **위치**: 사각형 바(`button` 요소) 내부
- **렌더링 조건**: `delayInfo.expectedProgress !== null` 및 `start && end`가 존재하는 경우
- **스타일링**:
  - `absolute top-0 bottom-0 w-0.5 z-10 pointer-events-none`
  - `left: ${expectedProgress}%`
  - 지연 상태별 고대비 스티치/색상:
    - 지연(`CRITICAL` / `WARNING`): `bg-amber-500 dark:bg-amber-400 shadow-sm`
    - 정상(`ON_TRACK` / `SLIGHT`): `bg-slate-700/80 dark:bg-slate-200/80`
  - 상/하단 미세 틱 마크(Optional) 또는 깔끔한 2px 세로선

#### 2) `apps/web/src/components/GanttExportView.tsx`
- **위치**: 정적 막대 `div` 내부
- 오늘 날짜(`getTodayIso()`) 기준으로 `calculateExpectedProgress`를 구하여 `left: ${expectedProgress}%` 세로선 렌더링.

---

## 4. 검증 및 테스트 계획

1. **로컬 개발 서버 빌드 및 화면 확인**:
   - `pnpm -F @sam/web typecheck` 실행으로 타입 에러 검증.
   - 다양한 일정(진행 중, 지연 중, 완료, 시작 전) 항목에서 세로선 위치 및 실제 진행률 채움 바와의 상호작용 확인.
2. **이미지 내보내기 검증**:
   - 간트 차트 내보내기 실행 시 다운로드된 PNG/SVG 이미지에 세로선이 정상 렌더링되는지 확인.
