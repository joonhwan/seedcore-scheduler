# [Design Spec] 일정 항목 호버 도구막대 더보기(⋯) 드롭다운 개선

## 1. 개요 (Overview)

SAM Scheduler의 일정 트리(`NodeTree`) 및 타임라인 뷰(`Timeline`)에서 일정 행(Row)에 마우스를 올렸을 때(Hover), 기존의 6개 편집 버튼(`↑`, `↓`, `↳`, `+`, `⇄`, `✕`)이 포함된 긴 툴바가 우측 영역(`absolute right-1`)을 다 덮어 우측 끝의 **진척률(%), 지연 상태 배지, 프로그레스 바**를 가리는 가시성 문제가 발생하고 있었습니다.

본 설계는 호버 시 긴 툴바 대신 컴팩트한 **더보기(`⋯`) 버튼** 1개만 표시하고, 클릭 시 드롭다운 팝업 메뉴를 띄우는 방식으로 개선하여, 진척률과 지연 정보를 항시 가림 없이 명확하게 확인할 수 있도록 합니다.

---

## 2. 요구사항 및 사용자 경험 (Requirements & UX)

1. **상시 정보 가시성 확보**:
   - 호버 상태에서도 진척률 배지(`45%`, `완료`, `0%`), 지연 상태 배지(`🚨`, `⚠️`), 미니 프로그레스 바가 가려지지 않고 선명하게 표시되어야 함.
2. **더보기(`⋯`) 버튼**:
   - 마우스 호버(`group-hover`) 시 진척률 배지 오른쪽(또는 인라인 우측)에 1개의 더보기 버튼(`⋯`)만 표시 (폭 24px 내외).
   - 클릭 시 드롭다운 메뉴 토글.
3. **드롭다운 팝업 메뉴**:
   - 클릭 시 클릭한 버튼 하단(오른쪽 정렬)에 메뉴 팝업 노출 (`z-50`).
   - 메뉴 구성:
     1. `↑` 위로 이동 (형제 노드 내 상단 이동)
     2. `↓` 아래로 이동 (형제 노드 내 하단 이동)
     3. `↳` 자식 추가 (최대 깊이 5단계 도달 시 disabled)
     4. `+` 형제 추가
     5. `⇄` 부모 변경
     6. `✕` 삭제 (위험 색상 red/rose 반영)
   - 외부 클릭 시 자동으로 닫히는 이벤트 밖 클릭 처리 (`useEffect` 또는 Popover backdrop).
4. **일관성 및 공통 컴포넌트화**:
   - `NodeTree.tsx` 및 `Timeline.tsx` 양쪽 모두 공통 `NodeRowActionMenu` 컴포넌트를 사용하여 조작성 및 디자인 통일.

---

## 3. 상세 컴포넌트 설계 (Component Architecture)

### 3.1 `NodeRowActionMenu.tsx` (신규 공통 컴포넌트)
- **위치**: `apps/web/src/components/NodeRowActionMenu.tsx`
- **Props**:
  - `node`: `NodeTreeItem` (대상 노드)
  - `indexAmongSiblings`: `number`
  - `siblingCount`: `number`
  - `canCreate`: `boolean` (기본값 true)
  - `canDelete`: `boolean` (기본값 true)
  - `onMoveSibling`: `(node: NodeTreeItem, direction: -1 | 1) => void`
  - `onAddChild`: `(node: NodeTreeItem) => void`
  - `onAddSibling`: `(node: NodeTreeItem) => void`
  - `onChangeParent`: `(node: NodeTreeItem) => void`
  - `onDelete`: `(node: NodeTreeItem) => void`

### 3.2 `NodeTree.tsx` 및 `Timeline.tsx` 변경
- 기존 inline 호버 버튼 div 제거.
- `<NodeRowActionMenu ... />` 배치.

---

## 4. 데이터 및 예외 처리 (Edge Cases & Safety)

- **트리 깊이 제한**: `node.depth + 1 >= MAX_TREE_DEPTH`인 경우 '자식 추가' 메뉴 항목 비활성화.
- **순서 이동 제한**: 첫 번째 형제일 경우 '위로 이동' 비활성화, 마지막 형제일 경우 '아래로 이동' 비활성화.
- **메뉴 열림 상태 제어**: 특정 행의 더보기 메뉴가 열려 있을 때는 마우스가 행을 벗어나더라도 메뉴가 닫히지 않고, 메뉴 클릭 또는 외부 영역 클릭 시 닫히도록 설정.

---

## 5. 검증 계획 (Verification Plan)

1. 타입 검사: `pnpm -r typecheck` 실행하여 컴파일 오류 확인.
2. Web UI 테스트:
   - 마우스 호버 시 진척률(%) 정보가 가려지지 않고 완전히 노출되는지 확인.
   - `⋯` 버튼 클릭 시 팝업 메뉴가 정상 출현하는지 확인.
   - 메뉴 항목 (위로/아래로/자식추가/형제추가/부모변경/삭제) 클릭 시 해당 동작이 정상 수행되는지 확인.
