import { MAX_TREE_DEPTH } from '@sam/shared';
import { ApiError } from './api';

const KNOWN: Record<string, string> = {
  CONFLICT: '다른 사용자가 먼저 변경했습니다. 다시 불러오기 후 시도해 주세요.',
  CYCLE_DETECTED: '하위 노드를 자기 자신의 자손으로 이동할 수 없습니다.',
  MAX_DEPTH_EXCEEDED: `최대 깊이(${MAX_TREE_DEPTH}단계)를 초과했습니다.`,
  GROUP_DATES_NOT_EDITABLE: 'GROUP 노드는 시작/종료일을 직접 편집할 수 없습니다.',
  GROUP_PROGRESS_NOT_EDITABLE: 'GROUP 노드의 진척율은 자손 ITEM 들의 평균으로 자동 계산됩니다.',

  PROJECT_BOUNDARY: '다른 프로젝트로는 이동할 수 없습니다.',
  NOT_ARCHIVED: '활성 상태에서는 삭제할 수 없습니다. 먼저 보관(ARCHIVE) 처리하세요.',
  NODE_CREATE_FORBIDDEN: '일정 추가는 프로젝트 매니저 또는 관리자만 할 수 있습니다.',
  NODE_DELETE_FORBIDDEN: '일정 삭제는 프로젝트 매니저 또는 관리자만 할 수 있습니다.',
  LAST_MANAGER: '마지막 MANAGER 는 제거하거나 변경할 수 없습니다.',
  CANNOT_CHANGE_SELF_ROLE: '자기 자신의 역할은 변경할 수 없습니다.',
  NAME_CONFLICT: '같은 이름이 이미 존재합니다.',
  USERNAME_TAKEN: '이미 사용 중인 username 입니다.',
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다.',
  PASSWORD_POLICY_VIOLATION: '비밀번호 정책을 충족하지 않습니다.',
  LAST_ACTIVE_ADMIN: '활성 ADMIN 이 자기 자신뿐이라 비활성화할 수 없습니다.',
  CSRF_ORIGIN_MISMATCH: '요청 출처 검증 실패. 새로고침 후 다시 시도하세요.',
  CSRF_ORIGIN_MISSING: '요청 출처 검증 실패. 새로고침 후 다시 시도하세요.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  MANAGER_REQUIRED: '매니저를 최소 1명 지정해야 합니다.',
  INVALID_MANAGER_IDS: '지정한 매니저 중 존재하지 않거나 비활성화된 사용자가 있습니다.',
  INVALID_MEMBER_IDS: '지정한 멤버 중 존재하지 않거나 비활성화된 사용자가 있습니다.',
  NO_DATED_ITEMS:
    '원본 프로젝트에 날짜가 지정된 일정이 없어 일정을 옮길 수 없습니다. 원본 일정 유지로 복제하십시오.',
};

export function apiErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof ApiError) {
    const code = err.code;
    if (code && KNOWN[code]) return KNOWN[code];
    if (err.status === 401) return '로그인이 필요합니다.';
    if (err.status === 403) return '권한이 없습니다.';
    if (err.status === 404) return '대상을 찾을 수 없습니다.';
    if (err.status === 409) return KNOWN.CONFLICT ?? '변경 충돌이 발생했습니다.';
    if (err.status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
    if (code) return code;
    return fallback ?? `요청 실패 (HTTP ${err.status})`;
  }
  return fallback ?? '알 수 없는 오류가 발생했습니다.';
}

export function isConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409;
}
