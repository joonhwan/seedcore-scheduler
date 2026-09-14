import { projectLastModifiedAt, type ProjectListItem } from '@sam/shared';

/**
 * 프로젝트 목록의 기본 정렬 (사용자가 컬럼 헤더로 정렬을 고르기 전).
 *
 * **최근에 수정된 것부터 세운다.** 손이 자주 가는 프로젝트가 늘 맨 위에 있어야 한다는
 * 요청(2026-09 사용자 요청 5번)에 따른 것이다. 여기서 "수정"은
 * `projectLastModifiedAt()` 이 정하며, 프로젝트 행 자체의 변경(이름·설명·보관 상태)과
 * 일정 변경(추가·수정·이동·삭제) 중 더 최근 것이다. 댓글은 들어가지 않는다 —
 * 댓글까지 넣으면 일정이 그대로인 프로젝트가 목록 위로 올라와 순서가 어지러워진다는
 * 사용자 판단이었다.
 *
 * ### 예전에 createdAt 으로 세웠던 이유와, 그것을 되돌린 이유
 *
 * 한동안 이 함수는 생성일 기준이었다. 정렬 키가 편집으로 바뀌는 값이면 목록에서 이름을
 * 고치거나 보관 처리를 하는 순간 그 행이 다른 자리로 튀는데, 당시에는 목록이 10건씩
 * 페이지로 잘려 있어서 사용자에게는 "보고 있던 항목이 사라진" 것으로 보였기 때문이다.
 *
 * 지금은 두 가지가 달라졌다. 첫째, 요청의 핵심이 "최근 작업한 프로젝트를 위에서 찾고
 * 싶다"는 것이라 생성일 정렬로는 목적을 이룰 수 없다. 둘째, 행이 튀어 보이던 문제의
 * 실제 원인은 정렬 키가 아니라 페이지 나누기였고, 목록을 한 화면에서 이어 스크롤하도록
 * 바꾸면(같은 요청 4번) 행은 화면 안에서 자리만 옮길 뿐 사라지지 않는다.
 *
 * status 를 정렬 키에 넣지 않는 것은 그대로다. 활성/보관 구분은 상태 필터 버튼과 상태
 * 배지가 이미 담당한다.
 *
 * 수정 시각이 같을 때(시드 데이터처럼 한 번에 만들어진 경우)는 id 로 갈라 순서를 고정한다.
 * 그러지 않으면 목록을 다시 받아올 때마다 그것들끼리 순서가 뒤바뀐다. 이 2차 키의 방향은
 * 아무래도 상관없고 오름차순으로 뒀다 — 정하기만 하면 된다.
 */
export function compareProjectsByRecentlyModified(
  a: ProjectListItem,
  b: ProjectListItem,
): number {
  const am = projectLastModifiedAt(a);
  const bm = projectLastModifiedAt(b);
  // ISO 8601 UTC 문자열이라 사전식 비교가 곧 시간 순서다. 최근 것이 앞에 와야 하므로 뒤집는다.
  if (am !== bm) return am > bm ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * 목록 헤더를 눌러 정렬할 수 있는 컬럼.
 *
 * 화면(`ProjectsPage`)의 헤더와 이 목록은 반드시 같아야 한다. 여기에 없는 이름이
 * 저장돼 있으면 `parseSortSelection` 이 기본 정렬로 떨어뜨리므로, 헤더에 컬럼을
 * 추가하면서 이 목록을 빠뜨리면 **그 컬럼의 정렬만 조용히 무시된다.**
 */
export const PROJECT_SORT_FIELDS = [
  'name',
  'priority',
  'description',
  'progress',
  'status',
  'memberCount',
  'myRole',
  'createdAt',
  'updatedAt',
] as const;

export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

/**
 * 사용자가 고른 정렬. `null` 은 "고른 것 없음", 곧 기본 정렬(최근 수정순)을 뜻한다.
 *
 * 헤더를 세 번 눌러 기본 정렬로 되돌린 것도 하나의 선택이므로, 이 `null` 역시
 * 저장한다. "저장한 적 없음"과 "기본 정렬을 골랐음"이 같은 결과가 되는 것은
 * 의도된 것이다 — 둘 다 기본 정렬로 보이면 된다.
 */
export type ProjectSortSelection = {
  by: ProjectSortField;
  order: 'asc' | 'desc';
} | null;

/** 같은 화면의 컬럼 폭 키(`sam_project_list_column_widths_v3`)와 같은 관례를 따른다. */
const SORT_STORAGE_KEY = 'sam_project_list_sort_v1';

export function serializeSortSelection(sel: ProjectSortSelection): string {
  return JSON.stringify(sel);
}

/**
 * 저장해 둔 문자열에서 정렬 선택을 복원한다. 믿을 수 없는 값이면 기본 정렬로 떨어뜨린다.
 *
 * localStorage 는 사용자가 직접 고칠 수 있고, 컬럼 이름이 바뀌면 옛 값이 남는다.
 * 검사 없이 그대로 쓰면 존재하지 않는 필드로 정렬을 시도해 목록이 뒤죽박죽으로 보인다.
 */
export function parseSortSelection(raw: string | null): ProjectSortSelection {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const { by, order } = parsed as { by?: unknown; order?: unknown };
  if (typeof by !== 'string') return null;
  if (!(PROJECT_SORT_FIELDS as readonly string[]).includes(by)) return null;
  if (order !== 'asc' && order !== 'desc') return null;

  return { by: by as ProjectSortField, order };
}

/**
 * 정렬 선택을 읽어 온다. 저장소를 쓸 수 없으면 기본 정렬로 둔다.
 *
 * 사생활 보호 모드나 쿠키 차단 설정에서는 localStorage 접근 자체가 예외를 던진다.
 * 그것 때문에 목록 화면 전체가 뜨지 않는 일은 없어야 하므로 조용히 삼킨다.
 */
export function loadSortSelection(): ProjectSortSelection {
  try {
    if (typeof localStorage === 'undefined') return null;
    return parseSortSelection(localStorage.getItem(SORT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** 정렬 선택을 이 브라우저에만 남긴다. 서버로 보내지 않으므로 PC 마다 따로 기억된다. */
export function saveSortSelection(sel: ProjectSortSelection): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SORT_STORAGE_KEY, serializeSortSelection(sel));
  } catch {
    // 저장소를 쓸 수 없는 환경이면 기억하는 것만 포기한다. 정렬 자체는 계속 동작한다.
  }
}

/**
 * 컬럼마다 처음 눌렀을 때의 방향.
 *
 * 적지 않은 컬럼은 오름차순에서 시작한다. **중요도만 내림차순이다** — 중요도로 정렬하는
 * 의도는 거의 언제나 "중요한 것을 위에서 보겠다" 이고, 규칙의 일관성보다 이쪽이 덜
 * 헷갈린다.
 */
const FIRST_ORDER: Partial<Record<ProjectSortField, 'asc' | 'desc'>> = {
  priority: 'desc',
};

/**
 * 헤더를 한 번 눌렀을 때 옮겨 갈 다음 정렬 선택을 계산한다.
 *
 * 같은 컬럼을 계속 누르면 첫 방향(`FIRST_ORDER`) → 반대 방향 → 기본 정렬로 돌아오고,
 * 다른 컬럼을 누르면 그 컬럼의 첫 방향에서 시작한다. 대부분의 컬럼은 첫 방향이
 * 오름차순이지만 중요도는 내림차순이다 — 화면이 오래 써 온 동작에 `FIRST_ORDER` 예외를
 * 더한 것뿐이다.
 *
 * 화면의 클릭 처리기가 분기마다 상태를 따로 세우는 대신 이 함수를 한 번 부르도록
 * 한 것은, **다음 상태가 한 값으로 나와야 저장을 빠뜨리는 갈래가 생기지 않기**
 * 때문이다.
 */
export function nextSortSelection(
  current: ProjectSortSelection,
  field: ProjectSortField,
): ProjectSortSelection {
  const first = FIRST_ORDER[field] ?? 'asc';
  if (current?.by !== field) return { by: field, order: first };
  if (current.order === first) return { by: field, order: first === 'asc' ? 'desc' : 'asc' };
  return null;
}
