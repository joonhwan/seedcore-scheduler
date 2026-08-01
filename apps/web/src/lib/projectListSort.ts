import type { ProjectListItem } from '@sam/shared';

/**
 * 프로젝트 목록의 기본 정렬 (사용자가 컬럼 헤더로 정렬을 고르기 전).
 *
 * 생성 순서(오래된 것부터)로 세운다.
 *
 * 예전에는 서버가 준 순서를 그대로 썼는데, 그 순서가
 * `orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]`
 * (apps/api/src/projects/projects.service.ts) 였다. 두 키 모두 목록에서 하는 편집으로
 * 바뀌는 값이라, 보관 처리를 하면 그 행이 보관 블록 맨 뒤로, 이름을 바꾸면 활성 블록
 * 맨 위로 튀었다. 페이징이 클라이언트 쪽이라 사용자에게는 "보고 있던 페이지에서
 * 항목이 사라진" 것으로 보였다.
 *
 * createdAt 은 한 번 정해지면 바뀌지 않으므로 무엇을 고쳐도 행이 움직이지 않는다.
 * status 를 정렬 키에서 뺀 것도 같은 이유다 — 활성/보관 구분은 상태 필터 버튼과
 * 상태 배지가 이미 담당한다.
 *
 * createdAt 이 같을 때(시드 데이터처럼 한 번에 만들어진 경우)는 id 로 갈라 순서를
 * 고정한다. 그러지 않으면 목록을 다시 받아올 때마다 그것들끼리 순서가 뒤바뀐다.
 */
export function compareProjectsByCreation(a: ProjectListItem, b: ProjectListItem): number {
  // createdAt 은 ISO 8601 UTC 문자열이라 사전식 비교가 곧 시간 순서다.
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}
