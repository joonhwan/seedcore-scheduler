# 프로젝트 목록 화면 개선 — 설계

- 작성일: 2026-08-01
- 상태: 승인됨
- 범위: 프론트엔드 전용 (`apps/web`)

---

## 1. 배경

프로젝트 목록 화면(`apps/web/src/pages/ProjectsPage.tsx`)에 세 가지 문제가 있다.

1. **좌우 여백이 크다.** 페이지가 `mx-auto max-w-7xl p-6` 으로 감싸여 있어 폭이 1280px 로 묶인다
   (`ProjectsPage.tsx:221`). 게다가 테이블은 컬럼 폭 합계(`totalTableWidth`, `:92`)만큼의 고정 픽셀 폭이라,
   넓은 모니터에서는 테이블 오른쪽이 통째로 비어 보인다.
2. **명칭을 바꿀 수단이 없다.** 인라인 편집은 `components/ProjectNameEditor.tsx` 로 이미 만들어져 있지만
   프로젝트 **상세 화면 전용**이다 (설계: `2026-08-01-project-rename-inline-design.md`).
3. **보관 처리를 목록에서 못 한다.** 보관·복원 로직은 상세 화면의 `setStatus()`
   (`ProjectDetailPage.tsx:764`)에만 있다. 목록의 `관리` 컬럼에는 `복제` 와, 이미 보관된 경우에 한해
   `삭제` 만 있다 (`ProjectsPage.tsx:499`).

백엔드는 셋 다 이미 지원한다. `PATCH /api/v1/admin/projects/:id` 하나가 `name` 과 `status` 를 모두 받는다.

## 2. 목표와 비목표

**목표**

- 목록 테이블이 화면 폭을 남김없이 쓰게 한다.
- 목록에서 프로젝트 명칭을 그 자리에서 고칠 수 있게 한다.
- 목록에서 보관 처리와 복원을 할 수 있게 한다.

**비목표**

- 백엔드 · `packages/shared` · DB 스키마 · 마이그레이션 변경 — **일절 없다**
- 설명(`description`) 편집
- 일반 USER 화면의 변화 — 지금 그대로다
- 목록 화면의 그 밖의 리팩터링

## 3. 권한

명칭 변경과 보관·복원 **둘 다 `isAdmin && adminMode`** 에서만 노출한다.

`관리` 컬럼 자체가 이미 `adminMode` 조건으로 렌더링되므로(`ProjectsPage.tsx:434`, `:494`),
보관·복원 버튼에는 조건을 더 붙일 필요가 없다. 명칭 편집의 연필 버튼은 이름 셀에 있으므로
호출부에서 같은 조건을 계산해 `canRename` 으로 넘긴다.

상세 화면은 보관에 `canManage`(프로젝트 MANAGER 포함) 기준을 쓰지만, 목록은 관리자 모드 기준으로
통일한다. 상태 필터(활성/보관 토글, `:254`)가 이미 관리자 모드 전용이라 맥락이 맞고,
컬럼 표시 규칙이 세 갈래로 갈라지는 것을 피할 수 있다.

## 4. 레이아웃 — 폭 상한 해제와 남는 폭 흡수

### 4.1 페이지 컨테이너

`ProjectsPage.tsx:221` 의 `<main className="mx-auto max-w-7xl p-6">` 를
`<main className="px-3 py-6">` 로 바꾼다. 헤더·검색바·테이블·페이징이 모두 화면 폭을 쓰게 된다.

### 4.2 남는 폭 분배

테이블 폭을 컨테이너 폭에 맞춘다.

- 테이블을 감싼 `div`(`:316`)의 폭을 `ResizeObserver` 로 관찰한다.
- `slack = max(0, 컨테이너폭 - totalTableWidth)`
- `slack` 을 **설명(`description`) 컬럼에만** 더해서 렌더링한다.
- 결과적으로 테이블 폭 = 컨테이너 폭이 되어 오른쪽이 비지 않는다.
- 컬럼 폭 합계가 컨테이너보다 넓으면 `slack = 0` 이고, 기존처럼 `overflow-x-auto` 가 가로 스크롤을 준다.

설명 컬럼을 흡수처로 고른 이유는 그것만이 길이가 가변인 자유 텍스트이기 때문이다. 날짜·멤버 수·상태는
내용 길이가 정해져 있어 넓혀 봐야 여백만 늘어난다.

### 4.3 순수 함수로 분리

분배 계산은 UI 에서 떼어 내 단위 테스트한다.

```ts
// apps/web/src/lib/projectListColumns.ts

/** 컬럼 키 목록과 하드코딩 기본 폭. ProjectsPage 에서 이리로 옮긴다. */
export const DEFAULT_COLUMN_WIDTHS: Record<string, number>;

export function computeRenderedWidths(
  stored: Record<string, number>,
  containerWidth: number,
  adminMode: boolean,
): { widths: Record<string, number>; tableWidth: number };
```

- `stored` 에 없는 키는 `DEFAULT_COLUMN_WIDTHS` 로 메운다.
- `adminMode` 가 false 면 `manage` 컬럼을 합계에서 뺀다 (기존 `totalTableWidth` 와 동일한 규칙).
- `containerWidth` 가 0 이하(측정 전)면 `slack = 0` 으로 두고 합계 폭을 그대로 돌려준다.
  첫 렌더에서 테이블이 잠깐 좁게 그려졌다가 넓어지는 것을 막기 위해, 측정 전에는
  기존과 똑같이 동작하게 한 것이다.

### 4.4 리사이즈 드래그와의 화해

저장값은 픽셀인데 렌더 폭은 slack 이 얹힌 값이라 둘이 어긋난다. 드래그를 시작할 때
`startWidth` 를 **저장값이 아니라 실제 렌더 폭**으로 잡아 이 어긋남을 없앤다
(`ProjectsPage.tsx:55` 의 `startWidth.current` 대입부).

이렇게 하면 설명 컬럼을 잡아끄는 순간 slack 이 저장값으로 흡수되고, 이후에는 손이 가는 대로 따라온다.
다른 컬럼을 넓히면 slack 이 그만큼 줄어 테이블 폭은 계속 컨테이너에 붙어 있다.

**남는 자잘한 어색함(수용)**: slack 이 남아 있는 상태에서 설명 컬럼을 왼쪽으로 끌어 좁히면
저장값은 줄지만 slack 이 그만큼 늘어 렌더 폭은 그대로다. 설명 컬럼은 이미 화면에 맞춰 늘어난
상태이므로 "더 좁힐 수 없다"는 것이 자연스럽고, 이를 없애려면 slack 분배와 저장 폭을 하나로 합치는
큰 개편이 필요하다. 여기서는 다루지 않는다.

### 4.5 `관리` 컬럼 기본 폭과 저장 키

`관리` 컬럼에 버튼이 셋(보관/복제/삭제)이 되므로 기본 폭을 `140` → `180` 으로 올린다.

폭 상태는 `{ ...defaultWidths, ...parsed }` 로 합쳐지므로(`ProjectsPage.tsx:37`) 이미 저장된 `140` 이
새 기본값을 덮어쓴다. 이를 피하려고 localStorage 키를 올린다.

```
'sam_project_list_column_widths' → 'sam_project_list_column_widths_v2'
```

옛 키는 읽지도 지우지도 않고 그냥 둔다. 사용자별로 한 번 폭이 초기화되는 것이 이 변경의 대가다.

## 5. 명칭 인라인 편집

### 5.1 기존 컴포넌트를 훅과 껍데기로 나눈다

`ProjectNameEditor.tsx` 는 상세 헤더에 맞춰진 스타일(`text-lg font-bold`, `w-64` 고정 입력창,
연필이 이름 **왼쪽**)을 갖고 있어 테이블 셀에 그대로 못 쓴다. `variant` prop 으로 클래스를 분기하면
컴포넌트 안에 두 화면의 사정이 섞이므로, 로직을 훅으로 내리고 껍데기를 둘로 나눈다.

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/lib/useProjectNameEdit.ts` | 신규 — 편집 상태·제출·에러 처리 전부 |
| `apps/web/src/components/ProjectNameEditor.tsx` | 기존 — 훅을 쓰도록 축소. **겉모습과 동작은 그대로** |
| `apps/web/src/components/ProjectNameCell.tsx` | 신규 — 목록 셀용 껍데기 |

### 5.2 훅 인터페이스

```ts
export interface ProjectNameTarget {
  id: string;
  name: string;
  updatedAt: string;
}

export function useProjectNameEdit(project: ProjectNameTarget): {
  editing: boolean;
  draft: string;
  setDraft: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  canSubmit: boolean;
  pending: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  submit: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};
```

`ProjectNameTarget` 이 세 필드뿐이라 `ProjectDetail` 과 `ProjectListItem` 양쪽이 그대로 들어맞는다
(`ProjectDetail = ProjectListItem.extend({ createdById })`, `packages/shared/src/index.ts:183`).

훅 내용은 현재 `ProjectNameEditor.tsx:25-74` 를 옮긴 것이고 동작 규칙은 바뀌지 않는다.

- 편집 진입 시 자동 포커스 + 전체 선택
- 저장값은 `normalizeProjectName(draft)` 으로 trim
- `expectedUpdatedAt: project.updatedAt` 동봉 (AGENTS.md 4.5 낙관적 잠금)
- 성공: 편집 모드 종료 + 성공 토스트
- 409 포함 실패: **편집 모드 유지** + `apiErrorMessage` 토스트

### 5.3 목록 셀 껍데기 (`ProjectNameCell`)

```ts
props: { project: ProjectListItem; canRename: boolean }
```

**보기 모드** — 지금의 이름 `<Link>`(`ProjectsPage.tsx:452`)를 그대로 두고 오른쪽에 연필 버튼을 붙인다.
연필은 **행에 마우스를 올렸을 때만** 보인다. `<tr>` 에 `group` 클래스를 더하고 버튼에
`opacity-0 group-hover:opacity-100 focus:opacity-100` 을 준다. `focus:` 를 같이 주는 이유는
키보드로 탭 이동할 때 보이지 않는 버튼에 포커스가 갇히는 것을 막기 위해서다.

연필 클릭 핸들러는 `e.preventDefault()` + `e.stopPropagation()` 을 호출한다. 셀 안에 상세 화면으로 가는
링크가 있어서, 이게 없으면 편집을 시작하려다 페이지가 넘어간다.

**편집 모드** — 링크와 연필이 있던 자리가 입력창 + 체크 + X 로 바뀐다.

- 입력창은 `w-full min-w-0` 에 `text-sm` — 셀 폭에 맞춘다 (헤더판의 `w-64 text-lg` 와 다른 점)
- 체크/X 버튼은 `w-4 h-4` 로 셀 높이에 맞게 줄인다
- Enter / 체크 = 저장, Esc / X = 취소
- 저장 중에는 셋 다 disable 하고 체크 자리에 스피너

셀의 `truncate` 는 보기 모드에서만 적용한다. 편집 모드에서는 입력창이 잘리면 안 된다.

## 6. 보관 / 복원

### 6.1 배치와 동작

`관리` 컬럼(`ProjectsPage.tsx:499`)의 **맨 앞**에, 프로젝트 상태에 따라 버튼 하나만 놓는다.

| 상태 | 버튼 | 색 | 동작 |
| --- | --- | --- | --- |
| `ACTIVE` | `보관` | amber | `window.confirm` 확인 후 `status: 'ARCHIVED'` |
| `ARCHIVED` | `복원` | emerald | 확인 없이 즉시 `status: 'ACTIVE'` |

복원에 확인을 두지 않는 이유는 그것 자체가 되돌리는 동작이기 때문이다. 잘못 눌러도 `보관` 을
다시 누르면 된다.

색은 상세 화면의 보관(amber, `ProjectDetailPage.tsx:1023`)·복원(emerald, `:1035`) 버튼과 맞춘다.
다만 목록에서는 같은 칸의 `복제`·`삭제` 와 모양을 맞춰 아이콘이 아니라 글자 배지 형태로 만든다.

### 6.2 확인 문구

상세 화면 문구는 "화면 우측 상단의 복원 버튼"을 가리켜 목록에서는 맞지 않는다. 목록용으로 새로 쓴다.

```
'{프로젝트 이름}' 을(를) 보관 처리합니다.

보관된 프로젝트도 목록의 '복원' 버튼으로 언제든 다시 활성 상태로 되돌릴 수 있습니다.
```

### 6.3 행 단위 컴포넌트

`useUpdateProject(id)` 는 훅이라 `paginated.map()` 안에서 부를 수 없다. 행 단위 컴포넌트로 뺀다.

`apps/web/src/components/ProjectArchiveButton.tsx`

```ts
props: { project: ProjectListItem }
```

- `useUpdateProject(project.id)` 를 직접 호출
- `expectedUpdatedAt: project.updatedAt` 동봉
- 성공: `보관 처리되었습니다.` / `복원되었습니다.` 토스트
- 실패: `apiErrorMessage` 토스트
- 진행 중에는 버튼 disable + 스피너. 전체화면 오버레이는 띄우지 않는다
  (`deleteProject.isPending` 오버레이, `:628` 와 달리 상태 토글은 가벼운 동작이다)

캐시 갱신은 `useUpdateProject.onSuccess` 가 이미 `invalidateQueries(projectsKey)` 를 하므로
추가 작업이 없다 (`lib/projects.ts:47`).

## 7. 페이지 번호 clamp (곁다리 수정)

상태 필터가 `활성` 일 때 마지막 페이지의 마지막 항목을 보관하면 그 행이 목록에서 빠지면서
`currentPage > totalPages` 가 되어 빈 표가 남는다. 지금도 삭제에서 같은 일이 벌어지지만,
보관은 훨씬 자주 일어나므로 이번에 같이 고친다.

```ts
useEffect(() => {
  if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
}, [totalPages, currentPage]);
```

`totalPages === 0`(결과 없음)일 때 `currentPage` 를 건드리지 않는 이유는, 그 경우 이미 "조건에 맞는
프로젝트가 없습니다" 안내가 표시되고(`:308`) 페이징 컨트롤 자체가 숨겨지기 때문이다.

## 8. 테스트

`apps/web` 에는 `@testing-library/react` 와 `jsdom` 이 없다. 기존 웹 테스트는 전부 순수 로직 단위이고,
이번에도 그 관례를 따른다.

### 단위 테스트 — `apps/web/src/lib/projectListColumns.test.ts`

`computeRenderedWidths` 에 대해:

- 컨테이너가 합계보다 넓다 → 설명 컬럼만 늘어나고, 반환 `tableWidth` 가 컨테이너 폭과 같다
- 컨테이너가 합계보다 좁다 → 어떤 컬럼도 안 늘고 `tableWidth` 가 합계와 같다 (가로 스크롤)
- 컨테이너 폭 = 0 (측정 전) → 합계 그대로
- `adminMode: false` → `manage` 가 합계에서 빠진다
- `stored` 에 일부 키가 없다 → 기본값으로 메워진다

기존 `apps/web/src/lib/projectName.test.ts` 는 손대지 않고 그대로 통과해야 한다.

### 수동 검증 (브라우저)

1. 넓은 창 → 테이블이 화면 끝까지 채워지고 설명 컬럼이 넓다
2. 좁은 창 → 가로 스크롤이 생기고 컬럼이 안 찌그러진다
3. 컬럼 경계 드래그 → 손이 가는 대로 따라오고, 새로고침해도 폭이 유지된다
4. 관리자 모드 ON → 행 hover 시 연필, `관리` 칸에 보관/복제(/삭제)
5. 관리자 모드 OFF, 일반 USER → 지금과 동일 (연필도 관리 칸도 없음)
6. 이름 변경 후 저장 → 목록과 상세 화면 양쪽에 반영
7. 연필 클릭이 상세 화면으로 넘어가지 않는다
8. Esc / X → 원래 이름 복귀
9. 보관 → 확인 창 후 배지가 `보관` 으로 바뀐다. 필터가 `활성` 이면 행이 목록에서 빠진다
10. 복원 → 확인 없이 즉시 `활성`
11. 다른 탭에서 먼저 수정 후 저장 → 409 토스트 (이름 편집은 편집 모드 유지)
12. 마지막 페이지의 마지막 항목 보관 → 빈 표가 아니라 이전 페이지로 넘어간다
13. 상세 화면의 이름 편집이 이전과 똑같이 동작한다 (5.1 리팩터링 회귀 확인)

### 타입 검사

`pnpm -r typecheck`

## 9. 변경 파일

| 파일 | 변경 |
| --- | --- |
| `apps/web/src/lib/projectListColumns.ts` | 신규 — 기본 폭 + `computeRenderedWidths` |
| `apps/web/src/lib/projectListColumns.test.ts` | 신규 — 단위 테스트 |
| `apps/web/src/lib/useProjectNameEdit.ts` | 신규 — 편집 로직 훅 |
| `apps/web/src/components/ProjectNameCell.tsx` | 신규 — 목록 셀용 인라인 편집 |
| `apps/web/src/components/ProjectArchiveButton.tsx` | 신규 — 보관/복원 버튼 |
| `apps/web/src/components/ProjectNameEditor.tsx` | 훅을 쓰도록 축소 (겉모습 변화 없음) |
| `apps/web/src/pages/ProjectsPage.tsx` | 컨테이너 클래스, 폭 계산, 이름 셀, 보관 버튼, 페이지 clamp |

백엔드, `packages/shared`, DB 스키마, 마이그레이션 — **변경 없음**.
