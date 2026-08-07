# SAM Scheduler — 예상 진척률 및 지연 검출 시스템 설계서

- **작성일**: 2026-08-03
- **주제**: 예상 진척률(Expected Progress) 도출 개념, 지연 상태(Delay Status) 검출 원리 및 시각 효과 설계

---

## 1. 개요 및 배경

프로젝트 일정 관리에서 개별 일정 항목(ITEM)과 그룹 일정 항목(GROUP)은 시작일(`startAt`)과 종료일(`endAt`)을 가집니다. 
일정이 시작일부터 종료일까지 매일 일정한 속도로 진행된다고 가정할 때, **"오늘 날짜 기준 달성해야 할 예상 진척률"**을 선형 함수로 도출할 수 있습니다.

본 시스템은 이 개념을 바탕으로:
1. 개별 일정 항목 및 전체 프로젝트의 예상 진척률을 자동 계산합니다.
2. 예상 진척률 대비 실제 진척률이 떨어지는 **지연 일정(Delay)**을 자동 검출합니다.
3. 프로젝트 목록 및 간트 차트/트리 화면에서 사용자의 시선을 끌 수 있는 **직관적인 시각 효과(경고 뱃지, 펄스 애니메이션, 프로그레스 바 마커)**를 제공합니다.

---

## 2. 예상 진척률 및 지연 상태 도출 원리

### 2.1 예상 진척률 공식 (`calculateExpectedProgress`)
기준일(오늘, `todayIso`: `YYYY-MM-DD`)을 바탕으로 다음과 같이 계산됩니다:

1. `todayIso < startAt`: **`0%`** (아직 시작 전인 일정)
2. `todayIso >= endAt`: **`100%`** (종료일이 지난 일정이므로 100% 완료가 목표)
3. `startAt <= todayIso < endAt`:
   $$\text{elapsedTime} = \text{Date}(\text{todayIso}) - \text{Date}(\text{startAt})$$
   $$\text{totalTime} = \text{Date}(\text{endAt}) - \text{Date}(\text{startAt})$$
   $$\text{expectedProgress} = \text{clamp}\left( \text{round}\left( \frac{\text{elapsedTime}}{\text{totalTime}} \times 100 \right), 0, 100 \right)$$

### 2.2 지연 Gap 및 상태 분류 (`getNodeDelayInfo`)
- **실제 진척률 ($\text{actualProgress}$)**:
  - ITEM 노드: `progress` (0~100)
  - GROUP 노드: `progressEffective` (자손 ITEM 노드들의 단순 평균)
- **지연 차이 ($\text{delayGap}$)**:
  $$\text{delayGap} = \text{expectedProgress} - \text{actualProgress} \quad (\%p)$$

- **지연 상태 (Delay Status)**:
  - 🚨 **`CRITICAL` (심각 지연)**: $\text{delayGap} \ge 30\%p$ (예상보다 30%p 이상 미달 또는 마감일 초과 미완료)
  - ⚠️ **`WARNING` (주의 지연)**: $15\%p \le \text{delayGap} < 30\%p$ (예상보다 15%p 이상 30%p 미만 미달)
  - 📉 **`SLIGHT` (소폭 지연)**: $0\%p < \text{delayGap} < 15\%p$ (예상보다 15%p 미만 소폭 미달)
  - ✅ **`ON_TRACK` (정상/달성)**: $\text{delayGap} \le 0\%p$ (예상 진척률 이상 달성)
  - ⚪ **`UNKNOWN`**: 시작일/종료일 또는 실제 진척률 데이터가 없어 계산할 수 없는 경우

### 2.3 단기 일정(영업일 1~3일) 지연 예외 정책
1~3일짜리 단기 일정은 작업 마감 시점이나 퇴근 시 100%로 한 번에 처리하는 현장 습성을 반영하여, 진행 중인 상태에서 1~2일 만에 `CRITICAL` 경고가 남발되는 노이즈를 완화합니다:
- **대상 판별**: 영업일 수 $\text{countWorkingDays}(\text{startAt}, \text{endAt}) \le 3$ (주말 전용 0영업일일 경우 달력일 $\le 3$일)
- **지연 상태 규칙**:
  - `actualProgress >= 100`: **`ON_TRACK`**
  - `todayIso < endAt` (진행 중): **`ON_TRACK`** (Gantt/Progress Bar 예상선은 계산하되 경고 미발생)
  - `todayIso === endAt` (오늘 마감 & 미완료): **`WARNING`** (마감일 리마인드)
  - `todayIso > endAt` (마감일 도과 & 미완료): **`CRITICAL`** (심각한 일정 지연)

---

## 3. 백엔드 & 프론트엔드 연동 아키텍처

### 3.1 백엔드 (`projects.service.ts`)
- **성능 최적화**: 프로젝트 목록 조회 (`GET /api/v1/projects`) 시 프론트엔드가 수천 개의 개별 노드를 불필요하게 다운로드받지 않도록 백엔드에서 쿼리 시점에 노드 데이터를 단 1회 조인(`include: { nodes: true }`)합니다.
- **서버 측 집계**: `buildTreeItems`와 `calculateProjectDelaySummary`를 통해 프로젝트 전체의 평균 실제 진척률, 평균 예상 진척률, 지연 노드 수, 종합 지연 상태(`delaySummary`)를 미리 계산하여 전달합니다.

### 3.2 공유 패키지 (`packages/shared/src/expected-progress.ts`)
- 백엔드와 프론트엔드가 공유하는 단일 검증 로직으로 작성되어 지표의 100% 정합성을 보장합니다.

### 3.3 프론트엔드 UI/UX 시각 효과 (`apps/web`)
1. **`ProgressBarWithExpected.tsx`**: 실제 진척도 막대 상에 **오늘 기준 예상 진척률 위치를 나타내는 세로 핀 마커(Dash needle line)**를 시각화합니다.
2. **`DelayStatusBadge.tsx`**: 심각 지연 항목에 **🚨 `지연 (N%p 지연)` 펄스 애니메이션(Ping pulse)**을 적용하여 눈길을 사로잡습니다.
3. **`ProjectsPage.tsx`**: 프로젝트 목록 상단에 **지연 상태 요약 대시보드 카운터** 및 **지연 전용 필터 탭**(`전체`, `🚨 심각 지연만`, `⚠️ 지연 포함`)과 **지연 심각순 정렬** 기능을 제공합니다.
4. **`NodeTree.tsx` & `Timeline.tsx`**: 개별 프로젝트 트리 및 간트 차트 막대에서 지연 항목에 붉은색/주황색 하이라이트 및 펄스 스티커를 부착하고, **"⚠️ 지연 항목만 보기" 퀵 토글**을 지원합니다.
