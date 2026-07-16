# 프로젝트 이력 조회 기능 — 설계 문서

- 작성일: 2026-07-16
- 대상 저장소: SAM Scheduler (`seedcore-scheduler`)
- 상태: 설계 승인됨 (구현 계획 작성 전)

---

## 1. 배경과 목적

SAM Scheduler는 이미 모든 일정 노드의 변경을 `NodeHistory`에, 댓글을 `NodeComment`에 남기고 있다. 데이터는 충분히 쌓이지만, 조회 수단은 **노드 하나짜리 이력**(`GET nodes/:id/history`)뿐이다. 프로젝트를 가로질러 "누가 진행률을 낮췄나", "무엇이 삭제됐나", "댓글이 어디에 올라왔나" 같은 질문에 답할 방법이 없다.

이 기능은 **이미 쌓이는 이력·댓글 위에 프로젝트 단위 조회 계층**을 얹어, 특정 주제로 걸러 시간순으로 살펴볼 수 있게 한다. **새로 저장하는 데이터는 없고 읽기만 한다.**

### 목표
- 프로젝트 단위로 이력을 조회한다(시스템 전체가 아니라).
- 자주 필요한 다섯 가지 주제를 골라 볼 수 있다.
- 삭제된 일정의 이력도 포함하고, 그 상태를 화면에 드러낸다.
- 세 가지 기간(지난 1주 / 지난 1달 / 직접 지정)으로 좁혀 본다.

### 하지 않는 것 (이번 범위 밖)
- 진행률/변경 시 **사유 메모를 함께 입력·저장**하는 기능(향후 과제, 아래 8절 (A)안).
- 삭제된 노드의 **댓글 보존**(현재 노드 삭제 시 댓글이 함께 사라짐 — 별도 스키마 변경이 필요해 범위 밖).
- 목록 행에서 **해당 일정으로 바로 가기**(v1 제외, 8절 참고).
- 자유 조합 필터 도구(과설계 — 정해진 다섯 주제엔 불필요).

---

## 2. 대상 사용자와 권한

- **범위**: 프로젝트별. 프로젝트 화면 안에 위치한다(전역 감사 화면이 아니다).
- **열람 권한**: 그 프로젝트를 볼 수 있는 사람은 **누구나**(MANAGER/ADMIN으로 제한하지 않음). 기존 "프로젝트 멤버면 읽기 허용" 규칙(`assertReadAccess`: 멤버 OR ADMIN+관리자모드)을 그대로 재사용한다. 프로젝트 격리 자체는 유지된다(내가 속하지 않은 프로젝트는 여전히 못 봄).

---

## 3. 조회 주제 (5가지)

| 주제 코드 | 이름 | 무엇을 보나 |
|---|---|---|
| `ALL` | 모든 이력 | 프로젝트의 모든 변경 + 댓글을 시간순으로 (바탕이 되는 뷰) |
| `PROGRESS_DOWN` | 진행률 낮춤 | 진행률을 되돌린(내린) 변경과 그 행위자 |
| `DELETED` | 삭제 이력 | 삭제된 일정 목록 — 무엇이 누구에 의해 언제 지워졌나 |
| `PERIOD_CHANGE` | 기간 변경 | 시작일/종료일이 바뀐 항목 (마감이 밀린 일정 추적) |
| `COMMENTS` | 댓글 모음 | 여러 노드에 흩어진 댓글을 한곳에서 |

- `PROGRESS_DOWN`·`DELETED`·`PERIOD_CHANGE`는 사실상 `ALL`에서 특정 조건으로 걸러낸 부분집합이다. `ALL`이 바탕이고 나머지는 그 위의 필터로 자연스럽게 얹힌다.

### 공통 기간 필터 (모든 주제에 적용)
- `1w`: 지난 7일 (서버 "지금" 기준)
- `1m`: 지난 30일 (기본값). 달력상 "한 달"이 아니라 30일 고정으로 단순화한다.
- `custom`: 직접 지정한 `from`~`to`(YYYY-MM-DD), 양끝 날 포함

### 진행률 변경 ↔ 댓글 연결 방식 (결정: "B")
- 저장 시점에 진행률 변경과 댓글을 **연결하는 데이터는 없다**(어느 댓글이 어느 변경 때문인지 알 수 없음).
- 대신 조회 시점에 `ALL` 뷰에서 변경 이력과 댓글을 **하나의 시간순 목록으로 섞어** 보여준다. 그래서 "진행률을 내렸다" 근처에 "왜 내렸는지 댓글"이 시간 흐름대로 함께 보인다(느슨한 연결). 이는 기존 `ActivityFeedPanel`이 노드 하나 단위로 하던 병합을 프로젝트 단위로 넓힌 것이다.

---

## 4. 전체 구조

```
ProjectHistoryPage (새 페이지, /projects/:id/history)
  ├─ 상단: 기간 선택(1주 / 1달 / 직접범위) + 주제 선택(모든이력·진행률낮춤·삭제됨·기간변경·댓글)
  └─ 시간순 목록 (최신 먼저)
        ↑ useProjectHistory(id, { topic, range, from, to })   ← 새 프론트 훅
              ↑ GET /projects/:id/history?topic=&range=&from=&to=   ← 새 엔드포인트 하나
                    ↑ ProjectHistoryService  ← 새 서비스
                          ↑ NodeHistory(삭제분은 projectIdSnapshot) + NodeComment
```

- 진입점: 프로젝트 헤더에 "이력" 링크(기존 "타임라인"/"멤버" 링크와 같은 결).
- 배치: 기존 형제 라우트(`/projects/:id/timeline`, `/projects/:id/members`)와 나란히 **독립 페이지**로 둔다. `ProjectDetailPage`가 이미 커서, 탭으로 끼우기보다 파일을 분리하는 편이 깨끗하다.
- 백엔드 엔드포인트는 **하나**. 주제는 쿼리 파라미터로 분기하되, 내부는 "프로젝트 이력을 읽어 필터링"하는 공통 경로를 탄다. 새 주제는 필터 분기만 추가하면 된다.

### 재사용 / 신규
- **재사용**: `renderHistorySummary`·`ActionBadge`·`DiffTooltip`·`formatDateTime`(현재 `ActivityFeedPanel` 안에 있음 → 공용 조각으로 분리해 두 화면이 함께 씀), `assertReadAccess` 패턴, `NodeHistoryItem`·`NodeCommentItem` DTO.
- **신규**: 라우트·페이지 1개, 컨트롤러·서비스 1개, 공유 DTO(요청 쿼리 + 응답), 프론트 훅 1개, 공유 판정 함수(`isProgressDown` 등).

---

## 5. 백엔드 (조회 계층)

### 엔드포인트
```
GET /projects/:id/history?topic=<주제>&range=<기간>&from=YYYY-MM-DD&to=YYYY-MM-DD
```
- `topic`: `ALL`(기본) · `PROGRESS_DOWN` · `DELETED` · `PERIOD_CHANGE` · `COMMENTS`
- `range`: `1w` · `1m`(기본) · `custom`(이때만 `from`/`to` 사용)
- 새 `ProjectHistoryController` + `ProjectHistoryService`.
- 읽기 전용이라 전역 `AuthGuard`로 충분. 기존 `HistoryController` 관례에 맞춰 `OriginGuard`도 함께 붙인다(사소한 정합성 맞춤).

### 권한·존재 확인
1. 프로젝트 존재 확인 → 없으면 404.
2. `assertReadAccess(projectId, ctx)` → 멤버 OR ADMIN+관리자모드. 비멤버면 403 `NOT_A_MEMBER`.

### 주제별 조회 규칙
| 주제 | 원천 / 조건 |
|---|---|
| `ALL` | `NodeHistory(projectIdSnapshot=id)` 전부 + `NodeComment`(살아있는 노드, `deletedAt=null`) → 하나로 병합 |
| `PROGRESS_DOWN` | `NodeHistory` action=UPDATE 중 `diff.progress`가 `to < from` |
| `DELETED` | `NodeHistory` action=`DELETE` (삭제된 노드도 `projectIdSnapshot`로 포함) |
| `PERIOD_CHANGE` | `NodeHistory` action=UPDATE 중 `diff`에 `startAt` 또는 `endAt` 키 존재 |
| `COMMENTS` | `NodeComment`(살아있는 노드, `deletedAt=null`)만 |

- **구현 사실**: `diffJson`은 문자열이라 SQLite에서 내용으로 못 거른다. 진행률/기간 조건은 **기간 창으로 후보를 1차로 좁힌 뒤, 앱 레벨에서 `diffJson`을 파싱해 판정**한다(폐쇄망 소규모 + 기간 필터 덕에 후보 건수가 제한적이라 부담 없음). 판정에는 공유 함수(`isProgressDown`/`isPeriodChange`)를 쓴다.
- 깨진 `diffJson`은 기존 `parseDiff`가 안전하게 `{}`를 반환하므로 그 행은 조건에서 자연히 제외된다.

### 노드 제목 복원과 삭제 상태
- 목록의 각 행은 "어느 일정인지" 제목을 보여야 한다.
  - 살아있는 노드 → 현재 `ScheduleNode.title`을 조인.
  - 삭제된 노드 → 이력 `diffJson`에서 복원(DELETE 행의 `title.from`, 없으면 그 노드 CREATE 행의 `title.to`).
- `nodeDeleted` 판정: `nodeIdSnapshot`으로 살아있는 `ScheduleNode`를 찾으면 `false`, 못 찾으면 `true`. 결과 노드들에 대해 한 번에 계산한다.
- 삭제된 노드의 이력은 `DELETED`뿐 아니라 `ALL`·`PROGRESS_DOWN`·`PERIOD_CHANGE`에도 포함된다(예: 진행률을 낮췄다가 나중에 삭제한 일정 → "진행률 낮춤"에 여전히 뜨고 삭제 상태로 표시).

### 기간 경계
- `1w`/`1m`: 서버 "지금"에서 각각 7일/30일 전까지로 창을 계산.
- `custom`: `from` 0시 ~ `to` 하루 끝(그 날 포함). `NodeHistory.occurredAt`과 `NodeComment.createdAt` 모두 같은 창으로 필터.

### 결과 상한
- 기간 창으로 우선 제한하고, 최종 결과는 **상한 500건(최신순)**.
- 초과 시 잘라내고 응답에 `truncated=true`를 실어 "기간을 좁혀 보세요" 안내를 띄운다.
- 커서 페이지네이션은 넣지 않는다(YAGNI, 향후).

---

## 6. 공유 DTO (`packages/shared/src/index.ts`)

프로젝트 규칙(AGENTS.md 4.2)대로 모든 검증은 Zod로 정의한다.

### 요청 (쿼리 파라미터)
```ts
export const HistoryTopic = z.enum(['ALL','PROGRESS_DOWN','DELETED','PERIOD_CHANGE','COMMENTS']);
export const HistoryRange = z.enum(['1w','1m','custom']);

export const ProjectHistoryQuery = z.object({
  topic: HistoryTopic.default('ALL'),
  range: HistoryRange.default('1m'),
  from:  IsoDate.optional(),   // range='custom' 일 때만
  to:    IsoDate.optional(),
})
  .refine(v => v.range !== 'custom' || (v.from && v.to),
          { message: 'custom 범위는 from/to 가 필요합니다' })
  .refine(v => !(v.from && v.to) || v.from <= v.to,
          { message: 'from 은 to 보다 작거나 같아야 합니다' });
```
- 쿼리는 `@Body`가 아니므로 컨트롤러에서 `ProjectHistoryQuery`로 `@Query()`를 파싱한다(작은 쿼리용 파이프 또는 컨트롤러 내 `.parse` — 기존 `ZodValidationPipe`와 같은 계열).

### 응답 (통합 시간순 목록)
이력과 댓글을 한 목록에 담기 위해 `type`으로 구분되는 두 형태를 쓴다. 기존 아이템 스키마를 재사용하고, 화면에 필요한 노드 정보(`nodeTitle`, `nodeDeleted`)만 얹는다.
```ts
export const ProjectHistoryEntry = z.discriminatedUnion('type', [
  NodeHistoryItem.extend({
    type: z.literal('HISTORY'),
    nodeTitle: z.string(),      // 복원된 제목(삭제 노드 포함)
    nodeDeleted: z.boolean(),
  }),
  NodeCommentItem.extend({
    type: z.literal('COMMENT'),
    nodeTitle: z.string(),
    nodeDeleted: z.boolean(),   // 댓글은 살아있는 노드만 → 항상 false, 형태 통일용
  }),
]);

export const ProjectHistoryResponse = z.object({
  items: z.array(ProjectHistoryEntry),
  truncated: z.boolean(),       // 상한 초과로 잘렸는지
});
```
- HISTORY 항목은 이미 `nodeIdSnapshot`을 가지므로, 향후 "해당 일정으로 바로 가기"를 넣을 때 `nodeDeleted === false`면 그 id로 이동하면 된다. 별도 nullable id 필드는 두지 않는다.

### 공유 판정 함수 (백엔드·프론트 공용)
백엔드 필터와 프론트 렌더가 같은 판정을 쓰도록 순수 함수를 shared에 둔다(중복·불일치 방지).
```ts
// diff 는 { field: { from, to } } 형태
export function isProgressDown(diff): boolean;   // progress.to, from 둘 다 숫자이고 to < from
export function isPeriodChange(diff): boolean;   // diff 에 startAt 또는 endAt 존재
export function classifyChange(diff, action): ChangeKind;  // 진행률↑/↓/완료, 기간, 제목, 생성, 이동, 삭제, 복구
```

---

## 7. 프론트엔드 화면

### 화면 구성 (위 → 아래)
```
[ 기간 ]  ( 지난 1주 ) ( 지난 1달* ) ( 직접 범위 → [from] ~ [to] )
[ 주제 ]  { 모든 이력* } { 진행률 낮춤 } { 삭제됨 } { 기간 변경 } { 댓글 }
──────────────────────────────────────────────
┃ ↘ 진행률 80% → 50%      · "UI 설계"          · 홍길동 · 어제 14:30
┃ 💬 "하루 미뤄야 할 듯"    · "DB 이행"           · 김철수 · 오늘 09:10
┃ 🗑 삭제                  · "폐기된 항목" [삭제됨] · 이영희 · 3일 전
   (왼쪽 ┃ = 종류별 색 띠 / * = 기본값)
```
- 기간·주제는 각각 하나만 선택(단일 선택). 바꾸면 목록을 다시 조회한다.
- 목록은 시간 역순, 각 행 왼쪽에 종류색 띠.

### 행 라벨 규칙 (짧게 + 아이콘/색)
문장으로 풀지 않고 짧은 라벨로 쓴다. 색은 앱에 이미 쓰이는 계열(emerald/sky/amber/rose/violet)에 맞춘다.

| 변경 종류 | 아이콘 | 짧은 라벨(예시) | 강조색(아이콘·숫자) |
|---|---|---|---|
| 진행률 올림 | ↗ | `진행률 50% → 80%` | 초록(emerald) |
| 진행률 내림 | ↘ | `진행률 80% → 50%` | 빨강(rose) |
| 진행률 완료 | ✓ | `진행률 100%` | 진한 초록 |
| 기간 변경 | 📅 | `기간 …01-31 → …02-15` | 주황(amber) |
| 제목 변경 | ✏ | `제목 "구설계" → "신설계"` | 중립(slate) |
| 생성 | ＋ | `생성` | 초록(emerald) |
| 위치 이동 | ↳ | `위치 이동` | 주황(amber) |
| 삭제(이벤트) | 🗑 | `삭제` | 빨강(rose) |
| 복구 | ↺ | `복구` | 보라(violet) |
| 댓글 | 💬 | `(댓글 내용 그대로)` | 파랑(sky) |

- 각 행에는 라벨 외에 공통으로 **행위자 · 시각 · 어느 일정(제목)**을 함께 표시한다.
- 라벨 문자열 생성은 UI 관심사라 `web/lib`에 두고, 현재 `renderHistorySummary`를 짧은 라벨로 리팩터해 재사용한다.

### "삭제"의 두 뜻 구분 (혼동 방지)
- **🗑 삭제 (빨강 라벨)** = "이 시점에 일정을 지웠다"는 *이벤트* 한 줄.
- **회색 "삭제됨" 표식 + 제목 취소선** = 그 행이 가리키는 노드가 *지금은 없음* 표시. 진행률 내림 등 다른 이벤트 행에도 붙을 수 있다(그 일정이 나중에 지워진 경우). 이벤트 색과 별개인 **중립 회색**으로 처리한다.

### 배경/색 (결정: "왼쪽 색 띠")
- 행 배경은 흰색/중립을 유지하고, **왼쪽에 얇은 종류색 막대** + 아이콘·숫자에만 색을 준다. 긴 목록에서도 차분하게 읽히도록.

### 상태 표시
- 빈 결과: "이 기간에 해당하는 이력이 없습니다."
- 500건 초과(`truncated`): 상단에 "최근 500건만 표시했습니다. 기간을 좁혀 보세요." 띠.
- 로딩/에러: 기존 화면들과 같은 방식(인라인 문구 + toast).

### 해당 일정으로 바로 가기 — v1 제외
- 현재 노드 선택은 `ProjectDetailPage`의 내부 상태뿐이고, URL로 특정 노드를 지정하는 길도, 간트에서 특정 노드로 스크롤해 보여주는 기능도 없다(확인함). 그래서 다른 페이지에서 특정 일정으로 "가서 하이라이트"하려면 새 배관이 필요하다. **v1에서는 목록만 제공하고, 바로 가기는 다음 단계로 미룬다**(8절).

---

## 8. 향후 과제 (이번 범위 밖)

- **(A) 사유 메모 저장**: 진행률/변경 시 사유·메모를 함께 입력받아 그 변경 이력에 붙여 저장하고, 조회 화면에서 "변경 + 사유"를 나란히 본다. DB 스키마·쓰기 화면 변경이 따르며, 앞으로 쌓이는 것만 대상. 이 설계의 화면에 그대로 얹을 수 있게 구조를 남겨둔다.
- **해당 일정으로 바로 가기**: 두 갈래가 있다. (1) 제자리에서 그 노드 상세를 패널/모달로 열기(`ActivityFeedPanel` 재사용, 가벼움), (2) `/projects/:id?node=<id>` 파라미터 + 간트에 "노드로 스크롤" 기능 추가(범위 큼).
- **삭제된 노드의 댓글 보존**: 노드 삭제 시 댓글을 스냅샷/보존하도록 스키마를 바꾸면 삭제된 일정의 댓글까지 조회 가능.

---

## 9. 테스트 전략

저장소에는 백엔드 테스트가 없고, 프론트에서 순수 함수 단위 테스트(Vitest, 작은 팩토리로 기대값 비교)만 있다. 여기에 맞춘다.

- **공유 판정 함수** (`packages/shared`) 단위 테스트:
  - `isProgressDown(diff)` — `to < from`일 때만 참, `to === from`·`null`·비숫자는 거짓(경계값 포함).
  - `isPeriodChange(diff)` — `startAt`/`endAt` 키 유무.
  - `classifyChange(diff, action)` — 각 종류 분류.
- **라벨 문자열 생성**(`web/lib`) 단위 테스트: "진행률 80% → 50%" 등 기대값 비교.
- 서비스의 Prisma 쿼리·권한은 저장소 관례대로 별도 자동화 테스트 없이, 위 순수 로직으로 회귀를 잡는다.
- 코드 수정 후 `pnpm -r typecheck`로 컴파일 확인(AGENTS.md 4.1).

---

## 10. 데이터베이스 영향

- **스키마/마이그레이션 변경 없음.** 이미 존재하는 `NodeHistory`·`NodeComment`를 읽기만 한다. 새 테이블·컬럼·인덱스 추가 없음.
- 조회는 기존 인덱스 `node_history(project_id_snapshot, occurred_at)`를 그대로 활용한다.
- 따라서 AGENTS.md §7의 "DB 변경 알림" 대상이 아니다. (향후 (A)안을 진행하면 그때 스키마가 바뀌므로 별도 알림 대상이 된다.)
