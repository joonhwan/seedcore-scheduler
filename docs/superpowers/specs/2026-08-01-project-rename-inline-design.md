# 프로젝트 명칭 인라인 편집 — 설계

- 작성일: 2026-08-01
- 상태: 승인됨
- 범위: 프론트엔드 전용 (`apps/web`)

---

## 1. 배경

프로젝트 상세 화면에는 프로젝트 명칭을 바꾸는 수단이 없다. 백엔드는 이미 지원한다.

- `PATCH /api/v1/admin/projects/:id` — `apps/api/src/projects/projects.controller.ts:100`
- `UpdateProjectDto.name` (1~128자) — `packages/shared/src/index.ts:157`
- `ProjectsService.update()` 가 `patch.name` 을 반영하고 `PROJECT_UPDATE` 감사로그를 남김 — `apps/api/src/projects/projects.service.ts:208`

웹에는 `useUpdateProject` 훅(`apps/web/src/lib/projects.ts:40`)이 있지만 호출부가 `ProjectDetailPage.tsx:771` 한 곳뿐이고, 거기서는 `status`(보관/복원)만 넘긴다. 즉 **UI 만 없는 상태**다.

## 2. 목표

프로젝트 상세 화면 헤더에서 명칭을 그 자리에서 고칠 수 있게 한다. 별도 팝업을 띄우지 않고,
이름이 있던 자리가 입력창으로 바뀌는 인라인 편집 방식을 쓴다.

**비목표**

- 프로젝트 목록 화면(`ProjectsPage`)에서의 이름 편집
- 설명(`description`) 편집
- 백엔드/`packages/shared` 변경 — 일절 없다

## 3. 권한

연필 버튼은 **`isAdmin && adminMode`** 일 때만 렌더링한다. 즉 globalRole 이 ADMIN 이고,
관리자 모드가 켜져 있어야 한다. 프로젝트 MANAGER 는 대상이 아니다.

이 조건은 같은 화면의 다른 ADMIN 전용 기능(삭제 `ProjectDetailPage.tsx:857`, 보관/복원 `:1007`)과
동일한 규칙이다. API 가드(`@AdminOnly()`)는 globalRole 만 보므로 관리자 모드가 꺼져 있어도 요청 자체는
통과하지만, 화면 노출 규칙을 페이지 전체와 일치시키는 쪽을 택했다.

## 4. 컴포넌트 구조

`ProjectHeader`(`ProjectDetailPage.tsx:705`)는 이미 500줄 가까운 큰 함수다. 편집 상태를 여기에 더 얹지 않고
별도 파일로 분리한다.

### `apps/web/src/components/ProjectNameEditor.tsx`

```ts
props: {
  project: ProjectDetail;
  canRename: boolean;
}
```

- `canRename` 은 호출부에서 `isAdmin && adminMode` 로 계산해 넘긴다. 컴포넌트는 권한 판단을 하지 않는다.
- 편집 상태(`editing`, `draft`)는 이 컴포넌트 내부에만 둔다.
- `useUpdateProject(project.id)` 를 직접 호출한다.

### `apps/web/src/lib/projectName.ts`

제출 가능 여부 판단만 담당하는 순수 함수. UI 와 분리해 단위 테스트한다.

```ts
export function canSubmitProjectName(input: string, current: string): boolean
```

## 5. 동작

### 보기 모드

`ProjectDetailPage.tsx:864` 의 `<span>{project.name}</span>` 자리를 대체한다.
연필 아이콘 버튼(`canRename` 일 때만) + 이름 텍스트 순으로 배치한다.
진행률 배지와 상태 아이콘은 지금 위치 그대로 오른쪽에 남는다.

### 편집 모드

연필 버튼을 누르면 아이콘과 이름이 있던 자리가 다음으로 바뀐다.

1. `<input type="text">` — 현재 이름으로 채우고, 진입 시 자동 포커스 + 전체 선택
2. 초록색 체크 버튼 (확인)
3. 회색 X 버튼 (취소)

| 조작 | 결과 |
| --- | --- |
| Enter / 체크 버튼 | 저장 |
| Esc / X 버튼 | 취소하고 원래 이름으로 복귀 |
| `canSubmitProjectName` 이 false | 체크 버튼 비활성 |

저장 중에는 input 과 두 버튼을 disable 하고, 체크 버튼 자리에 스피너를 표시한다.

### 저장 요청

```ts
updateProject.mutateAsync({
  name: draft,
  expectedUpdatedAt: project.updatedAt,
});
```

`expectedUpdatedAt` 은 AGENTS.md 4.5 의 낙관적 잠금 규칙에 따라 필수다.

## 6. 에러 처리

| 상황 | 처리 |
| --- | --- |
| 성공 | 편집 모드 종료 + 성공 토스트 |
| 409 CONFLICT | 토스트로 안내하고 **편집 모드 유지** (입력값 보존) |
| 그 외 실패 | `apiErrorMessage` 로 토스트, 편집 모드 유지 |

409 에서 편집 모드를 유지하는 이유는 사용자가 방금 친 이름을 잃지 않게 하기 위해서다.
새로고침 후 재시도하면 된다.

캐시 갱신은 기존 `useUpdateProject.onSuccess` 가 이미 처리한다
(`setQueryData(projectKey)` + `invalidateQueries(projectsKey)`). 추가 작업 없음.

### 전체화면 오버레이 제외 (의도)

`ProjectDetailPage.tsx:1176` 의 전체화면 블러 오버레이는 `ProjectHeader` 가 가진
`updateProject.isPending` 을 본다. `ProjectNameEditor` 는 **자기 훅 인스턴스**를 쓰므로 그 오버레이가
뜨지 않는다. 이름 한 줄 고치는 데 화면 전체를 덮는 것은 과하므로 의도적으로 그대로 둔다.

## 7. 테스트

`apps/web` 에는 `@testing-library/react` 와 `jsdom` 이 없다. 기존 웹 테스트
(`ganttLayout.test.ts`, `ganttExport.test.ts` 등)는 전부 순수 로직 단위다. 이 관례를 따른다.

### 단위 테스트 — `apps/web/src/lib/projectName.test.ts`

`canSubmitProjectName` 에 대해:

- 빈 문자열 → false
- 공백만 있는 문자열 → false
- 현재 이름과 동일 → false
- 128자 → true (경계)
- 129자 → false (경계)
- 정상 변경 → true
- 앞뒤 공백만 다른 경우 → false (8항)
- 저장된 이름의 공백을 걷어내는 방향 → true (8항)

### 수동 검증

브라우저에서 확인한다.

1. ADMIN + 관리자 모드 ON → 연필 버튼 보임
2. ADMIN + 관리자 모드 OFF → 연필 버튼 안 보임
3. 일반 USER → 연필 버튼 안 보임
4. 이름 변경 후 저장 → 헤더와 프로젝트 목록 양쪽에 반영
5. Esc / X → 원래 이름 복귀
6. 다른 탭에서 먼저 수정 후 저장 → 409 토스트 + 편집 모드 유지

## 8. 앞뒤 공백 처리 (결정됨)

**저장할 때 trim 하고, 비교도 같은 기준으로 한다.**

서버는 trim 을 하지 않으므로 클라이언트가 정리해서 보낸다. `normalizeProjectName(input)` 이
그 한 곳이고, `canSubmitProjectName` 과 실제 요청이 모두 이 함수를 거친다.

결과적으로:

- `"기획"` → `" 기획 "` 은 trim 후 같으므로 변경이 아니다. 버튼이 비활성된다.
- 저장되는 값에는 앞뒤 공백이 절대 들어가지 않는다.
- 이미 `" 기획 "` 으로 저장된 기존 데이터가 있다면, `"기획"` 으로 고쳐 저장하는 정리는 허용된다.

이렇게 정한 이유는 이름이 다른 곳에서도 쓰이기 때문이다. CSV 내보내기 파일명
(`ProjectDetailPage.tsx:826`)과 삭제 확인 입력(`:1099`, 이름 완전 일치 요구)에서 눈에 보이지 않는
공백은 원인을 찾기 어려운 문제로 이어진다.

## 9. 변경 파일

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/lib/projectName.ts` | 신규 — `canSubmitProjectName` |
| `apps/web/src/lib/projectName.test.ts` | 신규 — 단위 테스트 |
| `apps/web/src/components/ProjectNameEditor.tsx` | 신규 — 인라인 편집 컴포넌트 |
| `apps/web/src/pages/ProjectDetailPage.tsx` | `:864` 교체 + import |

백엔드, `packages/shared`, DB 스키마, 마이그레이션 — **변경 없음**.
