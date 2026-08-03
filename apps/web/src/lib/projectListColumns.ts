/**
 * 프로젝트 목록 테이블의 컬럼 폭 계산 (docs/superpowers/specs/2026-08-01-project-list-ui-design.md)
 *
 * 테이블은 컬럼 폭 합계만큼의 고정 픽셀 폭으로 그려진다. 그래서 넓은 화면에서는
 * 오른쪽이 통째로 빈다. 남는 폭을 설명 컬럼에 얹어 테이블이 화면을 채우게 하는 계산을
 * 여기 모아 둔다. UI 와 떼어 놓은 이유는 이 계산이 리사이즈 드래그와 얽혀 있어
 * 눈으로 확인하기 어렵기 때문이다.
 */

/** 하드코딩 기본 폭. localStorage 에 저장된 값이 없을 때 쓴다. */
export const DEFAULT_COLUMN_WIDTHS = {
  name: 220,
  description: 320,
  progress: 190,
  status: 85,
  memberCount: 85,
  myRole: 110,
  createdAt: 120,
  updatedAt: 120,
  // 보관/복제/삭제 세 버튼이 들어가므로 다른 컬럼보다 넓다.
  manage: 180,
} as const satisfies Record<string, number>;


export type ProjectColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

const ALL_COLUMNS = Object.keys(DEFAULT_COLUMN_WIDTHS) as ProjectColumnKey[];

/** 관리자 모드와 무관하게 항상 보이는 컬럼들. 손으로 유지하지 않도록 파생시킨다. */
const BASE_COLUMNS: readonly ProjectColumnKey[] = ALL_COLUMNS.filter((k) => k !== 'manage');

/**
 * 남는 폭을 흡수하는 컬럼.
 *
 * 설명만이 길이가 정해지지 않은 자유 텍스트다. 날짜나 멤버 수처럼 내용 길이가
 * 뻔한 컬럼을 넓혀 봐야 여백만 늘어난다.
 */
export const FLEX_COLUMN: ProjectColumnKey = 'description';

/**
 * 실제로 렌더링할 컬럼 폭과 테이블 전체 폭을 구한다.
 *
 * @param stored         localStorage 에서 읽어 둔 사용자 조정 폭. 없는 키는 기본값으로 메운다
 * @param containerWidth 테이블을 감싼 요소의 폭. 아직 측정 전이면 0 을 넘긴다
 * @param adminMode      관리자 모드 여부. 꺼져 있으면 manage 컬럼이 렌더링되지 않는다
 *
 * containerWidth 가 합계보다 좁거나 아직 0 이면 남는 폭이 없으므로 합계를 그대로 돌려준다.
 * 이때는 기존과 똑같이 가로 스크롤이 생긴다. 측정 전(0)을 합계로 처리하는 이유는
 * 첫 렌더에서 테이블이 좁게 그려졌다가 넓어지며 덜컥거리는 것을 막기 위해서다.
 */
export function computeRenderedWidths(
  stored: Record<string, number>,
  containerWidth: number,
  adminMode: boolean,
): { widths: Record<ProjectColumnKey, number>; tableWidth: number } {
  const widths = {} as Record<ProjectColumnKey, number>;
  for (const key of ALL_COLUMNS) {
    const saved = stored[key];
    widths[key] =
      typeof saved === 'number' && Number.isFinite(saved) && saved > 0
        ? saved
        : DEFAULT_COLUMN_WIDTHS[key];
  }

  const visible: readonly ProjectColumnKey[] = adminMode
    ? [...BASE_COLUMNS, 'manage']
    : BASE_COLUMNS;
  const sum = visible.reduce((acc, key) => acc + widths[key], 0);

  const slack = containerWidth > sum ? containerWidth - sum : 0;
  widths[FLEX_COLUMN] += slack;

  return { widths, tableWidth: sum + slack };
}
