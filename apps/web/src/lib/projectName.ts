/**
 * 프로젝트 명칭 인라인 편집 (docs/superpowers/specs/2026-08-01-project-rename-inline-design.md)
 *
 * 편집 중인 입력값을 서버로 보내도 되는지 판단하는 순수 함수를 모아 둔다.
 * UI 와 분리해 둔 이유는 이 판단이 서버 검증 규칙과 어긋나면 400 이 나기 때문이다.
 */

/** `UpdateProjectDto.name` 의 상한 (packages/shared/src/index.ts) */
export const PROJECT_NAME_MAX_LENGTH = 128;

/**
 * 저장할 명칭으로 다듬는다. 앞뒤 공백은 버린다.
 *
 * 서버는 trim 을 하지 않으므로 여기서 정리해야 DB 에 눈에 안 보이는 공백이 남지 않는다.
 * 이름은 CSV 내보내기 파일명과 삭제 확인 입력(완전 일치 요구)에도 쓰여서,
 * 앞뒤 공백이 섞이면 나중에 원인 찾기 어려운 문제가 된다.
 */
export function normalizeProjectName(input: string): string {
  return input.trim();
}

/**
 * 확인(체크) 버튼을 누를 수 있는 상태인지 판단한다.
 *
 * @param input   사용자가 입력창에 친 현재 문자열 (가공 전 원본)
 * @param current 저장되어 있는 프로젝트 명칭
 * @returns true 면 저장 요청을 보낼 수 있다
 *
 * 비교도 저장과 같은 기준(trim 후)으로 한다. 그래서 앞뒤 공백만 더한 입력은
 * "바뀐 것 없음" 으로 보고 요청을 보내지 않는다.
 */
export function canSubmitProjectName(input: string, current: string): boolean {
  const next = normalizeProjectName(input);
  if (next.length === 0) return false;
  if (next.length > PROJECT_NAME_MAX_LENGTH) return false;
  return next !== current;
}
