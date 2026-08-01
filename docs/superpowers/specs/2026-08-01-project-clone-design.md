# 프로젝트 복제 (Project Clone) — 설계

- 작성일: 2026-08-01
- 상태: 승인됨 (구현 대기)
- 관련: AGENTS.md §4.4 (권한), §4.6 (트리·집계 정책), §4.7 (이력 보존)

## 1. 배경과 목적

고객사는 같은 제품의 1호기·2호기·3호기처럼 **일정 구조가 거의 동일한 프로젝트를 반복 생성**한다.
지금은 매번 트리를 처음부터 다시 만들어야 한다.

잘 만들어 둔 프로젝트를 템플릿처럼 써서, **일정 트리는 그대로 물려받고 날짜만 새 기간에 맞춰
옮긴 새 프로젝트**를 한 번에 만드는 기능을 추가한다.

## 2. 범위

### 복제하는 것
- 프로젝트 자체 (이름·설명은 새로 입력). **새 프로젝트의 `status` 는 원본과 무관하게 항상 `ACTIVE`** —
  보관된 지난 호기를 템플릿으로 써도 새 호기는 활성 상태로 시작한다
- 일정 트리 전체 — `title`, `description`, `kind`, `parentId` 관계, `sortOrder`, `depth`
- ITEM 의 `startAt` / `endAt` — 아래 §3 규칙으로 재매핑
- 멤버 — 원본 멤버를 물려받되 역할 변경·제외·추가 가능 (§5)

### 복제하지 않는 것
- **`progress` 는 전부 0 으로 초기화한다.** 새 호기는 아직 시작하지 않은 일정이다.
- 댓글 (`NodeComment`)
- 원본의 변경 이력 (`NodeHistory`) — 새 프로젝트에는 자기 자신의 `CREATE` 이력만 생긴다

## 3. 날짜 재매핑

### 3.1 세 가지 모드

| 모드 | 사용자 입력 | 기간 | 간격 | 동작 |
|---|---|---|---|---|
| `KEEP` | 없음 | 그대로 | 그대로 | 원본 날짜를 손대지 않는다 |
| `SHIFT` | 새 시작일 | **그대로** | **그대로** | `delta = 새시작일 − 원본최소시작일` 을 모든 날짜에 더한다 |
| `FIT` | 새 시작일 + 새 종료일 | 비례 | 비례 | 원본 span `[S,E]` 을 새 span `[S',E']` 으로 선형 사상한다 |

`FIT` 의 사상 공식 (달력일 기준, 주말·공휴일 구분 없음):

```
d' = S' + round( (d − S) × (E' − S') / (E − S) )
```

시작일과 종료일을 **각각** 사상하므로 **기간도 함께 늘거나 줄어든다.**
6개월 프로젝트를 12개월로 늘리면 2주짜리 작업은 4주가 된다.
기간을 유지한 채 통째로 밀고 싶으면 `SHIFT` 를 쓴다.

### 3.2 대상

**ITEM 의 `startAt` / `endAt` 만** 재매핑한다.

GROUP 은 건드리지 않는다. AGENTS.md §4.6 에 따라 GROUP 의 기간은 자손 ITEM 에서 자동 계산
(`startAtEffective` / `endAtEffective`)되고 DB 의 `start_at` / `end_at` 컬럼은 비어 있다.
ITEM 날짜만 옮기면 GROUP 은 자동으로 따라온다.

### 3.3 원본 span 계산

원본 프로젝트의 모든 ITEM 에서 `null` 이 아닌 `startAt` / `endAt` 값을 모아
최소값을 `S`, 최대값을 `E` 로 삼는다.

### 3.4 엣지 케이스

| 상황 | 처리 |
|---|---|
| 원본 span 이 0 일 (`E === S`) 인데 `FIT` | 0 으로 나누지 않고 모든 날짜를 `S'` 로 보낸다 |
| 반올림 때문에 결과가 `[S', E']` 을 벗어남 | `[S', E']` 로 clamp 한다 |
| 사상 후 개별 ITEM 에서 `endAt < startAt` | `endAt = startAt` 로 맞춘다 |
| `startAt` 만 있고 `endAt` 은 `null` (또는 반대) | 각 필드를 독립 사상한다. `null` 은 `null` 로 유지 |
| 날짜가 있는 ITEM 이 하나도 없는데 `SHIFT`/`FIT` | `400 NO_DATED_ITEMS`. UI 는 해당 옵션을 미리 비활성화한다 |
| 새 종료일이 새 시작일보다 앞 (`FIT`) | Zod refine 에서 거부 |

날짜 산술은 `YYYY-MM-DD` 문자열을 UTC epoch-day 정수로 바꿔서 한다.
`startAt` / `endAt` 이 `DateTime` 이 아니라 `String` 이므로 타임존 함정이 없다.

## 4. 순수 함수 분리

두 덩어리의 계산 로직을 Prisma·HTTP 와 무관한 순수 함수로 떼어낸다.
둘 다 한 군데만 틀어져도 5,000 노드 트리가 조용히 망가지는 지점이라 단위 테스트를 붙인다.

### 4.1 `packages/shared/src/clone-dates.ts`

`shared` 에 두는 이유: **web 이 입력 즉시 미리보기를 계산할 때 같은 코드를 써야 한다.**
API 가 실제 복제에서 쓰는 계산과 화면에 보이는 예상치가 어긋나면 안 된다.

기존 `history-utils.ts` + `history-utils.test.ts` 패턴을 따른다 (`packages/shared` 는 이미 vitest 사용).

```ts
export type CloneDateMode = 'KEEP' | 'SHIFT' | 'FIT';

export interface DatePair {
  startAt: string | null;
  endAt: string | null;
}

/** ITEM 들의 날짜에서 [S, E] 를 뽑는다. 날짜가 하나도 없으면 null. */
export function findDateSpan(items: DatePair[]): { start: string; end: string } | null;

/** 모드와 입력에서 사상 계획을 만든다. 이후 remapDatePair 가 이걸 반복 적용한다. */
export function buildRemapPlan(
  span: { start: string; end: string } | null,
  input: { mode: CloneDateMode; newStartDate?: string; newEndDate?: string },
): RemapPlan;

/** 한 ITEM 의 날짜 한 쌍을 사상한다. §3.4 의 clamp·역전 보정을 포함한다. */
export function remapDatePair(pair: DatePair, plan: RemapPlan): DatePair;
```

`RemapPlan` 은 모드별 판별 유니온이다 — `KEEP` 은 항등, `SHIFT` 는 `{ deltaDays }`,
`FIT` 은 `{ srcStart, srcEnd, dstStart, dstEnd }` (모두 epoch-day 정수).

### 4.2 `apps/api/src/projects/clone-tree.ts`

트리 재구성. 입력은 원본 노드 배열, 출력은 새 노드 배열이다. Prisma 없이 테스트된다.
b7721fa 로 `apps/api/vitest.config.ts` 가 추가되어 API 쪽 단위 테스트가 가능해졌다.

```ts
/**
 * 원본 노드들을 새 프로젝트용 노드로 재구성한다.
 *  - 각 노드에 새 UUID 를 부여하고 oldId → newId 맵으로 parentId 를 다시 엮는다
 *  - ITEM 날짜는 plan 대로 사상, progress 는 전부 0
 *  - depth 오름차순으로 정렬해 반환한다 (부모가 항상 먼저 오도록)
 */
export function buildClonedNodes(args: {
  sourceNodes: SourceNode[];
  newProjectId: string;
  actorId: string;
  plan: RemapPlan;
  newId: () => string;   // 테스트에서 결정적 ID 주입
}): ClonedNode[];
```

`newId` 를 주입받는 이유는 테스트에서 `randomUUID()` 대신 `n1`, `n2`… 를 넣어
부모 포인터가 정확히 어디로 엮였는지 단정할 수 있게 하기 위함이다.

## 5. 멤버 승계

**클라이언트가 원본 멤버 목록을 프리필해서 보내고, 서버는 받은 목록을 그대로 쓴다.**

서버가 원본 멤버를 다시 읽어 요청과 병합하는 방식보다 단순하고, 결과가 요청만 보면
바로 예측된다. "매니저를 새 사람으로 교체" 요구사항이 그냥 목록을 바꿔 보내는 것으로 해결된다.

서버 검증은 기존 `ProjectsService.create()` 와 동일하다:
- `managerUserIds` 최소 1명
- 모든 ID 가 존재하고 `isActive === true` — 아니면 `400 INVALID_MANAGER_IDS` / `INVALID_MEMBER_IDS`
- `managerUserIds` 와 `memberUserIds` 가 겹치면 MANAGER 우선 (중복 PK 방지)

## 6. API

### `POST /admin/projects/:id/clone`

`@AdminOnly()` + `@UseGuards(OriginGuard)` + `ZodValidationPipe`.
기존 `POST /admin/projects` 와 같은 권한 정책 — **ADMIN + 관리자 모드 전용**이다.

### 요청 DTO (`packages/shared/src/index.ts`)

```ts
export const CloneProjectDto = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).nullable().optional(),
  dateMode: z.enum(['KEEP', 'SHIFT', 'FIT']),
  newStartDate: IsoDate.optional(),   // SHIFT / FIT 에서 필수
  newEndDate: IsoDate.optional(),     // FIT 에서 필수
  managerUserIds: z.array(z.string().min(1)).min(1, '최소 1명의 MANAGER 가 필요합니다'),
  memberUserIds: z.array(z.string().min(1)).default([]),
});
```

`superRefine` 으로 모드별 필수 입력과 `newEndDate >= newStartDate` 를 검증한다.

### 응답

```ts
export const CloneProjectResult = z.object({
  project: ProjectDetail,
  nodeCount: z.number().int(),
});
```

### 서비스 흐름 — `ProjectsService.clone()`

1. 원본 프로젝트 존재 확인 (`404 PROJECT_NOT_FOUND`)
2. 멤버 ID 검증 (§5)
3. 원본 노드 전체 로드 (`projectId` 로 `findMany`)
4. `findDateSpan` → `buildRemapPlan` → `buildClonedNodes`
   - `SHIFT`/`FIT` 인데 span 이 `null` 이면 `400 NO_DATED_ITEMS`
5. `$transaction` (아래 §6.1)
6. `AuditLog` 에 `PROJECT_CLONE` 1건. `adminMode` 면 `ADMIN_OVERRIDE_EDIT` 도 함께
   (`AuditAction` enum 에 `PROJECT_CLONE` 추가)

`sortOrder` / `depth` / `kind` / `title` / `description` 은 원본 그대로 쓴다.
원본이 이미 밀집 정렬(dense, step 1)을 유지하고 있으므로 repack 이 필요 없다.

### 6.1 트랜잭션 순서

```
project.create
  → projectMember.createMany
  → depth 0..4 순으로 scheduleNode.createMany  (5회)
  → nodeHistory.createMany
```

노드를 **depth 순으로 나눠 넣는 이유**: `parent_id` 가 자기참조 FK 이므로 부모 행이
반드시 먼저 존재해야 한다. Prisma `createMany` 는 배열 순서 삽입을 보장하지 않으니
depth 별로 호출을 쪼갠다. 최대 깊이가 5 라서 호출은 5회로 끝난다.

`NodeHistory` 는 노드마다 `CREATE` 1건을 `createMany` 로 일괄 삽입한다.
`diffJson` 은 `{ "clonedFrom": { "projectId": ..., "nodeId": ... } }` 형태의 최소 기록이다.
프로젝트 이력 화면(`ProjectHistoryPage`)이 자연스럽게 채워지고, 어느 프로젝트에서
복제됐는지 감사 추적이 남는다.

5,000 노드 상한을 감안해 `$transaction` 의 `timeout` / `maxWait` 를 넉넉히 잡는다
(각 30초 / 10초). SQLite 는 단일 writer 이므로 복제 도중 다른 쓰기는 대기한다.

## 7. UI

### 진입점

프로젝트 목록(`ProjectsPage`)의 "관리" 열에 **복제** 버튼을 추가한다.
ADMIN + 관리자 모드에서만 보인다 (기존 삭제 버튼과 같은 조건).
`ARCHIVED` 프로젝트도 복제 가능하다 — 지난 호기를 템플릿으로 쓰는 게 자연스럽다.

### 새 페이지 — `/projects/:id/clone` (`ProjectClonePage`)

멤버 목록까지 들어가서 폼이 크므로 모달이 아니라 페이지로 만든다.
`ProjectNewPage` 의 구조와 스타일을 따른다.

- **이름** — 기본값 `{원본이름} (복사)`
- **설명** — 원본 값 프리필
- **일정 처리** — 라디오 3개
  - 원본 범위를 `원본 일정: 2026-01-05 ~ 2026-06-30 (177일)` 로 표시
  - 입력 즉시 `복제 후: 2026-09-01 ~ 2027-02-24` 미리보기 (§4.1 의 shared 함수 사용)
  - 원본에 날짜가 없으면 `SHIFT` / `FIT` 라디오를 비활성화하고 이유를 안내
- **멤버 승계** — 원본 멤버를 역할 프리필된 목록으로 띄운다
  - 행마다 MANAGER / MEMBER 전환, 체크 해제로 제외
  - 아래에 사용자 검색으로 신규 인원 추가 (`ProjectNewPage` 의 `useUsers` 패턴)
  - MANAGER 가 0명이면 제출 버튼 비활성화
- 완료 시 새 프로젝트 상세로 이동. `projectsKey` invalidate

### `apps/web/src/lib/projects.ts`

```ts
export function useCloneProject(sourceId: string)  // POST /admin/projects/:id/clone
```

## 8. DB 변경 사항

**스키마 변경 없음.** 새 테이블도 컬럼도 마이그레이션 파일도 추가하지 않는다.

기존 `projects` / `project_members` / `schedule_nodes` / `node_history` / `audit_logs` 에
행을 넣는 것뿐이다. b7721fa 이후 `prisma/migrations/` 가 단일 원본이 되었지만,
이 기능은 거기에 손대지 않으므로 **exe 배포판에서 `sp-migrate.exe` 재실행이 필요 없다.**
복제 기능이 들어간 새 exe 로 교체해도 기존 DB 가 그대로 동작한다.

## 9. 테스트

### `packages/shared/src/clone-dates.test.ts`
- `findDateSpan` — 날짜 없음 / 일부만 있음 / 전부 있음
- `SHIFT` — 2달 뒤로 밀 때 모든 기간·간격이 보존되는지
- `FIT` — 6개월 → 12개월에서 2주 작업이 4주가 되는지
- `FIT` 에서 원본 span 0 일 (0 나눗셈 없이 전부 `S'` 로)
- clamp — 반올림으로 `[S', E']` 을 벗어나지 않는지
- `endAt < startAt` 역전 보정
- 부분 날짜(`startAt` 만) 와 `null` 유지

### `apps/api/src/projects/clone-tree.test.ts`
- 5단계 깊이 트리에서 `parentId` 가 전부 새 ID 로 정확히 다시 엮이는지
- 반환 배열이 depth 오름차순인지 (부모 우선)
- `progress` 가 전부 0 인지
- GROUP 의 `startAt` / `endAt` 이 건드려지지 않는지
- `sortOrder` 가 원본과 동일한지

### 수동 검증
로컬 서버에서 실제 프로젝트를 세 모드로 각각 복제해, 트리 구조와 Gantt 뷰의
GROUP 집계 기간이 의도대로 나오는지 확인한다.
