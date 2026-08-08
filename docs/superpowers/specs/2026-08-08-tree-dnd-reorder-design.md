# 트리 드래그 앤 드롭 — 순서 변경과 부모 그룹 변경 설계

- 작성일: 2026-08-08
- 대상 화면: 프로젝트 상세(`/projects/:id`)의 간트 왼쪽 트리 라벨 칸
- 상태: 승인됨

## 1. 배경

프로젝트 상세 화면에서 일정 노드의 순서를 바꾸려면 지금은 행 액션 메뉴의 "위로/아래로" 버튼을
한 칸씩 눌러야 하고, 부모를 바꾸려면 "부모 그룹 변경" 다이얼로그를 열어야 한다.
둘 다 마우스 드래그 한 번으로 되게 한다.

백엔드는 손대지 않는다. `POST /api/v1/projects/:projectId/nodes/:id/move` 가 이미 필요한 걸 다 한다.

### 축소 경로 (fallback)

부모 변경까지 드래그로 하는 건 조작이 까다로울 수 있어서, 만들어 보고 어렵다고 판단되면
**부모 변경을 빼고 같은 부모 안의 순서 변경만 남긴다.** 그때 필요한 변경은 `treeDnd.ts` 안뿐이다.

- `depthRangeAt()` 이 `minDepth = maxDepth = 드래그 노드의 depth` 를 돌려주게 고정한다
  (가로 위치를 무시하게 된다).
- `resolveTarget()` 에서 `parentId !== 드래그 노드의 parentId` 인 대상은 무효로 돌린다.
- 5절의 드래그 가능 조건에 "형제가 자기 자신 하나뿐이면 핸들을 그리지 않는다"를 되살린다.

나머지(핸들, 임계값, 삽입선, 배지, 취소, 자동 스크롤, sortOrder 계산, 반영 방식)는 그대로 쓴다.

## 2. 서버 시맨틱 (전제)

`NodesService.move()` (`apps/api/src/nodes/nodes.service.ts`)는 **"빼고 나서 끼워넣기"** 로 동작한다.

1. 원래 부모 아래에서 `sortOrder > 기존값` 인 형제를 모두 -1 (같은 부모 안 이동일 때도 항상 실행)
2. 새 부모의 자식 수(자기 자신 제외)를 세어 `insertAt = min(newSortOrder, count + 1)` 로 clamp
3. 새 부모 아래에서 `sortOrder >= insertAt` 인 형제를 +1
4. 자손 depth 일괄 갱신
5. 이동 노드에 `sortOrder = insertAt` 기록

따라서 클라이언트가 보내는 `newSortOrder` 는 **목표 부모의 자식 목록에서, 자기 자신을 제외한
1-based 삽입 위치**다. 이동 방향(위/아래)에 따라 보정할 필요가 없다.

서버가 거절하는 조건: 자기 자신이나 자손을 부모로 지정(`CYCLE_DETECTED`), ITEM 을 부모로 지정
(`CANNOT_ADD_CHILD_TO_ITEM`), 서브트리 이동 후 최대 깊이 초과(`MAX_DEPTH_EXCEEDED`),
다른 프로젝트의 노드를 부모로 지정(`INVALID_PARENT`).

동시성: body 에 `expectedUpdatedAt` 이 필수이며, DB 값과 다르면 409 `CONFLICT` 가 난다.

## 3. 드롭 지점의 해석 — 세로는 위치, 가로는 깊이

트리는 이미 들여쓰기로 부모-자식 관계를 표현하고 있다. 그 축을 입력으로도 쓴다.

```
드롭 대상 = (행 경계 boundary, 깊이 depth)
```

그래서 드롭 대상 타입이 하나뿐이다. "그룹 G 의 자식으로 넣기"는 별도 개념이 아니라
"G 행 바로 아래 경계에, 깊이 `G.depth + 1` 로 넣기"다.

### 세로: 행의 위 절반 / 아래 절반

행 높이(`ROW_HEIGHT` = 32px)를 16px 씩 둘로 나눈다. 위 절반이면 그 행의 **위** 경계,
아래 절반이면 **아래** 경계다. GROUP 과 ITEM 이 똑같다.

경계는 `0 .. rows.length` 로 번호를 매긴다. 경계 `b` 는 `rows[b]` 바로 위에 있고,
`b === rows.length` 는 마지막 행 아래다.

### 가로: 허용 범위 안에서 깊이를 고른다

경계 `b` 에서 위 행을 `above = rows[b-1]`, 아래 행을 `below = rows[b]` 라 하면:

```
maxDepth = above 가 없으면 0
           above 가 GROUP 이면 above.depth + 1   (그 그룹의 첫 자식이 될 수 있다)
           그 외에는 above.depth
minDepth = below 가 있으면 below.depth, 없으면 0

depth = clamp(round((x - LABEL_BASE_PX) / INDENT_PX), minDepth, maxDepth)
```

`LABEL_BASE_PX = 8`, `INDENT_PX = 16` 이며, 이건 라벨 칸이 실제로 쓰는 들여쓰기 계산
(`Timeline.tsx` 의 `paddingLeft: 8 + node.depth * 16`)과 같은 식이다.
따라서 **삽입선이 시작하는 자리가 곧 결과 깊이**다.

`x` 는 라벨 칸 왼쪽 끝 기준 좌표다. 라벨 칸은 `sticky left-0` 이라 가로 스크롤과 무관하다.

### 깊이에서 부모와 삽입 위치를 끌어낸다

- `above` 가 없으면(`b === 0`): `parentId = null`, `insertIndex = 0`
- `depth === above.depth + 1`: `parentId = above.id`, `insertIndex = 0` (그 그룹의 첫 자식)
- 그 외: `above` 에서 부모를 타고 올라가 `depth` 에 있는 조상 `anchor` 를 찾는다.
  `parentId = anchor.parentId` 이고, `anchor` **뒤에** 끼운다.

`insertIndex` 는 목표 부모의 자식들을 `sortOrder` 순으로 세우고 **드래그 중인 노드를 뺀** 배열에서의
0-based 삽입 위치다. `anchor` 가 드래그 중인 노드 자신이면 그 배열에 없으므로,
"자기 자신을 뺀 형제 중 `sortOrder` 가 자기보다 작은 것의 개수"로 계산한다(= 지금 자리).

### 이 규칙이 푸는 문제

```
  ▸ 📁 G          (부모 P, depth 0)
      📄 D        (부모 G, depth 1)
  ─────────────────────────────  ← 이 경계 하나에서
      📄 S        (부모 P, depth 0)

  마우스가 오른쪽(x≈24)  →  선이 depth 1 에서 시작 → G 안, D 뒤
  마우스가 왼쪽(x≈8)     →  선이 depth 0 에서 시작 → P 안, G 뒤
```

같은 경계라도 가로 위치로 갈리고, 선의 들여쓰기가 결과를 그대로 보여준다.
트리 맨 끝(`below` 없음)에서는 `minDepth = 0` 이라 최상위까지 뺄 수 있다.

### 표시

- **삽입선**: 가로 2px 선. `8 + depth * 16` 위치에서 시작해 라벨 칸 오른쪽 끝까지.
  라벨 칸 안에만 그린다(`sticky left-0` 이라 가로 스크롤과 무관하게 제자리에 있다).
- **색**: 부모가 그대로면 sky, 부모가 바뀌면 amber.

### 커서 배지 (설명 텍스트)

선의 위치와 색만으로는 "몇 번째로 들어가는지"와 "왜 안 되는지"를 알 수 없으므로,
커서를 따라다니는 작은 배지로 결과를 글로 적는다. 커서 오른쪽 12px, 아래 16px 이고,
화면 오른쪽/아래 끝에 닿으면 반대쪽으로 뒤집는다.

| 상황 | 문구 | 배경색 |
|---|---|---|
| 같은 부모, 순서만 | `3번째로 이동` | sky |
| 다른 부모 안으로 | `"설계 단계" 안 3번째로 이동` | amber |
| 최상위로 | `최상위 3번째로 이동` | amber |
| 무효 — 자손 | `자기 하위로는 옮길 수 없습니다` | rose |
| 무효 — 깊이 | `최대 깊이 10단계를 넘습니다` | rose |
| 제자리 | 배지 없음 (선도 없음) | — |

순서 숫자는 사용자가 보는 1-based 값(`newSortOrder`)을 그대로 쓴다.
부모 이름이 길 수 있으므로 배지를 `max-w-xs truncate` 로 자른다.

"ITEM 은 부모가 될 수 없습니다"는 사유가 표에서 빠진 이유는, ITEM 행 아래 경계의 `maxDepth` 가
`above.depth` 라서 **ITEM 을 부모로 삼는 깊이 자체를 고를 수 없기** 때문이다.
서버 판정(2절)에는 남아 있지만 드래그에서는 도달할 수 없다.

## 4. 무효한 드롭

놓기 전에 프론트에서 걸러, 무효하면 삽입선을 그리지 않고 커서를 `not-allowed` 로 두며
커서 배지에 사유를 적는다. "선이 보인다 = 놓으면 그대로 된다"가 항상 성립하게 한다.

- 목표 부모가 드래그 중인 노드 자신이거나 그 자손이면 무효
  (`자기 하위로는 옮길 수 없습니다`)
- `depth + 서브트리 상대 깊이 >= MAX_TREE_DEPTH`(10)이면 무효
  (`최대 깊이 10단계를 넘습니다`)

**제자리**(같은 부모이고 `insertIndex` 가 지금 자리와 같음)는 무효와 다르게 다룬다.
아예 대상이 없는 것으로 보고 선도 배지도 그리지 않는다. 사유를 알릴 게 없기 때문이다.

판정 함수는 불리언이 아니라 `{ ok, reason }` 을 돌려준다.
`ParentPickerDialog.isDisabled` 가 이미 이 모양이므로 그 함수를 `treeDnd.ts` 로 옮겨 공유한다.
두 경로가 서로 다른 이유로 거절하기 시작하면 "왜 여긴 되고 저긴 안 되지"가 되기 때문이다.

## 5. 드래그 가능 조건과 조작

### 조건

아래를 모두 만족할 때만 드래그 핸들을 그린다.

- `canEditNodes` 가 참 (프로젝트 MANAGER·MEMBER 이거나 관리자 모드).
  이 프로젝트는 원래부터 **이동을 "편집"으로 분류**한다 — `ProjectDetailPage.tsx` 의
  `canEditNodes = MANAGER | MEMBER | (ADMIN && adminMode)` 이고, 추가·삭제만 더 강한 권한이다.
  행 메뉴의 위/아래 버튼과 "부모 그룹 변경"도 같은 정책을 따르므로 드래그만 따로 조일 이유가 없다.
- 체크박스 다중 선택 모드가 아님 (`selectionMode === false`)
- `empty-row-placeholder` 행이 아님

### 드래그 시작

라벨 칸 맨 왼쪽에 `∷` 모양 핸들을 둔다. 자리는 항상 차지하되 행 hover 전에는 투명이라
레이아웃이 흔들리지 않는다. 커서는 `grab`.

이 핸들에서 시작한 `pointerdown` 만 드래그로 취급한다. 그래서 기존 상호작용과 겹치지 않는다:

- 라벨 칸의 클릭(선택), 더블클릭(편집), 체크박스, 접기/펼치기 토글
- 오른쪽 차트 영역의 간트 막대 편집 드래그(`startBarDrag`)와 배경 가로 패닝(`isDragging`)

포인터가 3px 이상 움직여야 실제 드래그로 전환한다. 손떨림으로 트리가 바뀌는 걸 막는다.

### 드래그 중

- 원본 행: 반투명(`opacity-40`)
- 유효한 대상: 3절의 삽입선과 배지
- 무효한 위치: 선을 그리지 않고 커서를 `not-allowed` 로, 배지에는 사유
- 전역 `select-none`, 커서 `grabbing`
- 세로 자동 스크롤: 스크롤러 위/아래 32px 안에 포인터가 들어가면 스크롤한다.
  (막대 드래그의 가로 자동 스크롤과 같은 방식)

### 취소

`Esc` 키, `pointercancel`, 무효한 위치에서 드롭, 제자리 드롭 —
모두 "아무 요청도 보내지 않고 상태만 되돌린다".

## 6. 요청과 반영

### sortOrder

`newSortOrder = insertIndex + 1`. 2절의 서버 시맨틱과 정확히 맞는다.

### 반영

드롭하면 `useMoveNode` 로 요청하고 **응답이 온 뒤** 목록을 다시 불러 그린다(낙관적 갱신 없음).
요청 중에는 기존 `useIsMutating` 스피너가 그대로 뜬다.

접혀 있는 GROUP 의 첫 자식으로 넣으면 결과가 화면에 안 보이므로,
**성공 후 그 그룹을 자동으로 펼친다**(`collapsedIds` 에서 제거).
드래그 중에 그룹 위에 머무른다고 자동으로 펼쳐지지는 않는다(타이머 기반 auto-expand 는 넣지 않는다).

실패하면 `apiErrorMessage` 로 토스트만 띄우고 화면은 손대지 않는다.
409(다른 사람이 먼저 수정)도 이 경로를 그대로 탄다.
되돌리기 로직이 없으므로 sortOrder 재배열 규칙을 프론트에 두 번 구현할 일이 없다.

## 7. 코드 배치

`Timeline.tsx` 는 이미 1,492줄이다. 드래그 상태 기계를 여기에 더 밀어넣지 않는다.

### `apps/web/src/lib/treeDnd.ts` (신규, 순수 함수)

DOM 의존성 없는 계산만 담고 단위 테스트를 붙인다.

```ts
export const INDENT_PX = 16;
export const LABEL_BASE_PX = 8;

export interface DropTarget {
  boundary: number;          // 삽입선을 그릴 행 경계 (0 .. rows.length)
  depth: number;             // 삽입선 들여쓰기 = LABEL_BASE_PX + depth * INDENT_PX
  parentId: string | null;
  insertIndex: number;       // 자기 자신을 뺀 형제 배열에서의 0-based 삽입 위치
  ok: boolean;
  reason?: string;
}
```

- `depthRangeAt(rows, boundary)` — `{ minDepth, maxDepth }`
- `resolveTarget(rows, items, node, boundary, depth)` — `DropTarget`.
  3절의 부모·삽입 위치 유도와 4절의 무효 판정이 여기 들어간다.
- `targetFromPointer(rows, items, node, x, y)` — `DropTarget | null`.
  `y` 는 행 컨테이너 상단 기준, `x` 는 라벨 칸 왼쪽 끝 기준 좌표다(둘 다 스크롤 보정을 끝낸 값).
  제자리면 `null` 을 돌려준다. `getBoundingClientRect` 와 스크롤 보정은 호출부가 맡는다.
- `sortOrderForTarget(target)` — `target.insertIndex + 1`
- `changesParent(node, target)` — 표시 색(sky/amber)을 고르는 데 쓴다
- `describeDropTarget(items, node, target)` — `{ text, tone: 'sky' | 'amber' | 'rose' }`.
  3절 표의 문구를 만든다.
- `canDropInto(items, node, parentId)` — `{ ok, reason? }`. `ParentPickerDialog` 도 이걸 쓴다.
- `appendSortOrder(items, parentId, excludeId)` — `ParentPickerDialog` 의
  `computeAppendSortOrder` 를 옮긴 것.

### `apps/web/src/components/Timeline.tsx` (수정)

포인터 이벤트 배선, 드래그 상태, 삽입선·배지 렌더링, 자동 스크롤만 남긴다.
새 prop:

```ts
onMoveTo?: ((node: NodeTreeItem, newParentId: string | null, newSortOrder: number) => Promise<void>) | undefined;
```

`Promise` 인 이유는 성공한 뒤에 접힌 그룹을 펼쳐야 하기 때문이다(`collapsedIds` 는 Timeline 의 상태다).

### `apps/web/src/pages/ProjectDetailPage.tsx` (수정)

`moveTo(node, newParentId, newSortOrder)` 하나를 두고, 드래그와 행 액션 메뉴의 위/아래 버튼이
같이 쓴다. 위/아래 버튼용 `onMoveSibling(node, direction)` 은 방향을 삽입 위치로 환산해
`moveTo` 를 부르는 얇은 어댑터로 남긴다(`NodeRowActionMenu` 의 prop 모양은 바꾸지 않는다).

### `apps/web/src/components/ParentPickerDialog.tsx` (수정)

`isDisabled` 와 `computeAppendSortOrder` 를 `treeDnd.ts` 의 것으로 교체한다. 화면은 그대로다.

## 8. 테스트

### 단위 테스트 (`apps/web/src/lib/treeDnd.test.ts`)

깊이 범위:

- 평범한 경계에서 `minDepth`/`maxDepth`
- `above` 가 펼쳐진 GROUP 이면 `maxDepth === above.depth + 1`
- `above` 가 ITEM 이면 `maxDepth === above.depth`
- `below` 가 없는 마지막 경계에서 `minDepth === 0`
- `boundary === 0` 에서 깊이가 0 으로 고정되는지

부모·삽입 위치 유도:

- 같은 부모 안에서 위로/아래로 옮길 때 `insertIndex`
- GROUP 바로 아래 경계 + `depth = G.depth + 1` → `parentId === G.id`, `insertIndex === 0`
- 펼쳐진 GROUP 의 마지막 자식 아래 경계에서, 깊은 쪽 깊이와 얕은 쪽 깊이가
  서로 다른 `parentId` 를 내는지 (3절 예시 그대로)
- 트리 맨 끝 경계에서 `depth = 0` 이면 최상위 맨 뒤로 가는지

무효 판정 (`ok: false` 와 사유가 붙는지):

- 목표 부모가 드래그 노드 자신
- 목표 부모가 드래그 노드의 자손
- 서브트리 깊이 때문에 `MAX_TREE_DEPTH` 초과

제자리:

- 자기 위 경계와 아래 경계 둘 다 `targetFromPointer` 가 `null` 을 돌려주는지

계산과 문구:

- `sortOrderForTarget` 이 `insertIndex + 1` 인지
- `changesParent` 가 같은 부모에 거짓, 다른 부모에 참인지
- `describeDropTarget` 이 3절 표의 여섯 가지 상황에 대해 문구와 톤을 맞게 돌려주는지

### 수동 확인

- MEMBER 계정으로 로그인해도 핸들이 보이는지 (이동은 MEMBER 에게 허용된 편집이다)
- 체크박스 선택 모드에서 핸들이 사라지는지
- 마우스를 가로로 움직이면 삽입선의 들여쓰기가 따라 바뀌는지
- 부모가 바뀌는 드롭에서 선이 amber 로, 안 바뀌면 sky 로 나오는지
- 커서 배지가 커서를 잘 따라오는지, 화면 오른쪽/아래 끝에서 뒤집히는지
- 무효한 곳에 대면 배지에 사유가 뜨는지 (자손 밑, 깊이 초과)
- 접힌 GROUP 의 첫 자식으로 넣으면 이동 후 자동으로 펼쳐지는지
- 드래그 중 `Esc` 로 취소되는지
- 긴 트리에서 위/아래 끝으로 끌 때 자동 스크롤이 되는지
- 간트를 가로로 스크롤한 상태에서도 삽입선이 라벨 칸에 붙어 제자리에 그려지는지
- 드래그 후 간트 막대, 지연 배지, GROUP 집계 날짜가 어긋나지 않는지

## 9. 비범위

- 드래그 중 GROUP 위에 머무르면 자동으로 펼쳐지는 타이머
- 여러 노드 한꺼번에 드래그
- 터치 기기 지원 (Pointer Events 를 쓰므로 우연히 될 수는 있으나 목표로 두지 않는다)
- 낙관적 갱신과 되돌리기
- 키보드 단축키로 이동
