# 간트 막대 드래그 편집 — 설계 문서

- 작성일: 2026-07-15
- 대상: SAM Scheduler 간트/타임라인 뷰(`apps/web/src/components/Timeline.tsx`)
- 상태: 설계 승인 완료, 구현 계획 대기

## 1. 목표

읽기 전용이던 간트 막대를 마우스로 드래그해 일정을 조정할 수 있게 한다.

- 막대 **양 끝**을 잡아 시작일/종료일을 늘리거나 줄인다(리사이즈).
- 막대 **본체(가운데)**를 잡아 기간 길이를 유지한 채 앞뒤로 옮긴다(전체 이동).
- **GROUP 막대는 드래그 대상이 아니다.** GROUP의 일정은 백엔드가 자식 ITEM들로부터 자동 집계한다.
- ITEM의 일정이 부모 그룹 범위를 벗어나면 그룹 일정도 따라 넓어진다 — 이는 **백엔드 집계로 자동 처리**되며, 화면에서는 드래그 중 실시간 미리보기로 즉시 보여준다.

## 2. 핵심 전제 (조사로 확인된 사실)

- 간트 막대는 SVG가 아니라 `<button>` + 절대 위치(픽셀)로 그려진다. `Timeline.tsx` 923~969줄.
- 날짜 → 픽셀 변환은 `leftPx = dayDiff(start, range.start) * ppd`, `widthPx = (dayDiff(end, start) + 1) * ppd`. `Timeline.tsx` 790~800줄.
- 픽셀 → 날짜 역변환은 이미 hover 툴팁 계산부에 존재한다(`Timeline.tsx` 307~317줄). 드래그 델타는 `deltaDays = Math.round(dx / ppd)`로 되돌린다.
- GROUP은 `startAt/endAt`이 항상 `null`이고, 화면 값은 `startAtEffective/endAtEffective`(자동 집계)다. `Timeline.tsx` 781~784줄.
- 백엔드는 GROUP에 날짜를 직접 넣으면 400(`GROUP_DATES_NOT_EDITABLE`)으로 거부한다. `apps/api/src/nodes/nodes.service.ts` 173~181줄.
- GROUP effective는 읽기 시 `buildTreeItems`가 자식 트리를 훑어 MIN/MAX·평균으로 계산한다. `apps/api/src/nodes/tree-aggregation.ts` 44~125줄.
- `Timeline`은 `items`만 받는 순수 표시 컴포넌트이며 직접 저장하지 않는다. 저장은 `ProjectDetailPage`가 `useUpdateNode`로 수행한다. `ProjectTimelinePage`(읽기 전용)는 편집 콜백을 넘기지 않는다.
- 노드 수정은 PATCH `/nodes/:id`, body는 `UpdateNodeDto`(`startAt`, `endAt`, `progress`, 필수 `expectedUpdatedAt`). `packages/shared/src/index.ts` 226~251줄.
- 동시성 제어: `updatedAt.toISOString() !== expectedUpdatedAt`이면 409 `{code:'CONFLICT', currentUpdatedAt}`. `nodes.service.ts` 165~171줄.

**결론: 백엔드·DB·공용 스키마 변경이 전혀 없다. 프론트엔드 표시·상호작용만 추가한다.**

## 3. 아키텍처 — 관심사 분리

- **`Timeline`(표시 컴포넌트)**: 드래그 상호작용과 실시간 미리보기까지 담당한다. 마우스를 놓아도 저장하지 않고, "변경 제안"(대상 ITEM, 기존값, 새 값, 영향받는 조상 그룹들)을 계산해 `onBarChange(proposal)` 콜백으로 페이지에 올린다.
- **`ProjectDetailPage`(편집 페이지)**: 확인 모달을 띄우고 Enter→저장 / ESC→취소를 처리한다. 스플래시·흐림 효과·충돌(409) 오류 처리도 여기서 맡는다.
- **`ProjectTimelinePage`(읽기 전용)**: `onBarChange`를 넘기지 않으므로 드래그가 자동으로 꺼진다.

이 분리는 기존 구조(순수 `Timeline` + 페이지가 mutation 소유)와 일치하고, 표시 컴포넌트에 저장·권한 로직이 섞이지 않게 한다.

## 4. 드래그 상호작용 (Timeline 내부)

활성 조건: `canEdit === true` **그리고** `node.kind === 'ITEM'`. GROUP 막대와 `empty-row-placeholder` 행(`Timeline.tsx` 785줄)은 제외한다.

- 막대 **양 끝 8px 영역**을 잡으면 리사이즈. 왼쪽 핸들=시작일, 오른쪽 핸들=종료일.
- 막대 **본체(가운데)**를 잡으면 기간 길이를 유지한 채 전체 이동.
- **1일 단위 스냅**: `deltaDays = Math.round(dx / ppd)`.
- 기존 배경 패닝은 `target.closest('button')` 가드로 막대 위에서는 시작되지 않는다(`Timeline.tsx` 351~360줄). 막대 드래그는 막대 `<button>`의 `onMouseDown` + `stopPropagation`으로 붙여 패닝과 충돌하지 않게 한다.
- 드래그 리스너는 기존 패턴(라벨 폭 리사이즈, `Timeline.tsx` 98~117줄)처럼 `document`에 `mousemove`/`mouseup`를 붙였다 떼는 방식으로 구현한다.

### 제약

- 리사이즈 시 `startAt ≤ endAt`을 지킨다. 한쪽 핸들이 반대쪽을 넘어가면 **최소 1일**로 clamp한다.
- 전체 이동은 기간(일수)을 그대로 유지한다.
- 드래그 도중 값은 로컬 미리보기 상태로만 반영하고, 원본 `items`는 건드리지 않는다.

## 5. 커서 구분 (요청사항)

| 대상 | 커서 |
|---|---|
| 차트 배경 횡스크롤(패닝) | `grab` → 드래그 중 `grabbing` (현행 유지) |
| 막대 양 끝(리사이즈) | `ew-resize` |
| 막대 본체(전체 이동) | `move` |

라벨 열 폭 리사이즈 핸들은 기존대로 `col-resize`를 유지한다(막대 리사이즈와 시각적으로 구분).

## 6. 실시간 미리보기 (드래그 중)

드래그 중인 ITEM의 새 `startAt/endAt`을 반영해, **그 ITEM의 조상 GROUP 체인만** effective(MIN/MAX)를 다시 계산하여 화면에 즉시 그린다.

- 백엔드 `tree-aggregation`의 MIN/MAX 규칙을 프론트 경량 함수로 재현한다. 조상 체인만 다루므로 계산이 가볍다.
- 진행률(progress) 미리보기는 다루지 않는다. 이번 작업은 일정(startAt/endAt)만 대상이며, 그룹 진행률 평균은 startAt/endAt 변경과 무관하다.
- 원본 데이터는 건드리지 않고 파생 상태로만 계산한다. 취소 시 원본을 그대로 다시 그리면 된다.

## 7. 확인 모달 (마우스를 놓았을 때)

마우스를 놓으면 `Timeline`이 변경 제안을 `onBarChange`로 올리고, `ProjectDetailPage`가 모달을 띄운다.

표시 내용:

- **대상 ITEM**: 제목, `기존 시작 ~ 종료  →  새 시작 ~ 종료`.
- **영향받는 그룹**: 범위가 바뀌는 부모→조상 그룹마다 `기존 effective  →  새 effective`. 바뀌지 않는 그룹은 표시하지 않는다.

조작:

- **Enter → 적용**.
- **ESC → 취소하고 화면 원복**(미리보기를 되돌려 원래 막대 위치로).

## 8. 적용 · 스플래시 · 오류 처리

- 적용 시 `useUpdateNode`로 PATCH `/nodes/:id` 호출. body에 변경된 `startAt`/`endAt`과 **필수 `expectedUpdatedAt: node.updatedAt`**을 담는다.
- mutation이 진행되는 동안(`isPending`) **"처리 중…" 스플래시 오버레이 + UI 흐림 효과**를 보여준다.
- 성공: 프로젝트 노드 쿼리를 무효화해 트리를 다시 불러온다. 이때 백엔드 집계가 그룹 effective를 확정한다. 미리보기 상태를 정리한다.
- **409 충돌**: 스플래시를 끄고 기존 `apps/web/src/lib/errors.ts`의 충돌 메시지("다른 사용자가 먼저 변경했습니다. 다시 불러오기 후 시도해 주세요.")를 보여준다. 미리보기를 원복한다.
- 그 밖의 실패: 스플래시를 끄고 오류 메시지를 보여준 뒤 미리보기를 원복한다.

## 9. 변경 파일 (예상)

- `apps/web/src/components/Timeline.tsx` — 드래그·미리보기·`onBarChange` 콜백, 커서, 리사이즈 핸들, 조상 그룹 재계산 유틸.
- `apps/web/src/pages/ProjectDetailPage.tsx` — 확인 모달 연결, 저장(`useUpdateNode`), 스플래시·흐림, 오류 처리.
- (신규) `apps/web/src/components/BarChangeConfirmDialog.tsx` — 확인 모달 컴포넌트.
- `apps/web/src/pages/ProjectTimelinePage.tsx` — 변경 없음(콜백 미전달로 읽기 전용 유지).
- 백엔드·`packages/shared`·Prisma 스키마·마이그레이션: **변경 없음.**

## 10. 범위 밖 (YAGNI)

- 진행률(progress) 드래그 편집.
- GROUP 막대 직접 편집(백엔드가 금지).
- 여러 노드 동시 드래그, 스냅 단위 선택(주/월 단위 스냅) 등.
- 읽기 전용 타임라인 페이지에서의 편집.

## 11. 열린 위험 요소

- **줌 배율이 낮을 때(월/분기 뷰) 1일 스냅의 조작감**: `ppd`가 작으면 1픽셀 미만이 하루가 되어 미세 드래그가 어렵다. 구현 시 최소 이동 임계값이나 표시 배율 안내를 검토한다.
- **range 밖으로의 이동**: `computeRange`가 앞뒤 1년 여유를 두므로(`Timeline.tsx` 975~1001줄) 대부분 문제없다. 저장 후 재조회 시 range가 새로 계산되어 확정된다.
