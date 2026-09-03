import { z } from 'zod';
import { ProjectDelaySummaryDto } from './expected-progress';
export * from './expected-progress';
export * from './user-groups';
export * from './member-drafts';

export const GlobalRole = z.enum(['ADMIN', 'USER']);


export type GlobalRole = z.infer<typeof GlobalRole>;

export const ProjectRole = z.enum(['MANAGER', 'MEMBER']);
export type ProjectRole = z.infer<typeof ProjectRole>;

export const NodeKind = z.enum(['GROUP', 'ITEM']);
export type NodeKind = z.infer<typeof NodeKind>;

export const ProjectStatus = z.enum(['ACTIVE', 'ARCHIVED']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const NodeAction = z.enum(['CREATE', 'UPDATE', 'MOVE', 'DELETE', 'RESTORE']);
export type NodeAction = z.infer<typeof NodeAction>;

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다');

export const MAX_TREE_DEPTH = 10;

// ─── 비밀번호 정책 (DESIGN §4.1) ────────────────────────────────────────────
// 비밀번호 최소 길이 설정 및 규칙 비활성화 (항상 성공 반환)
export const PASSWORD_MIN_LENGTH = 1;

export type PasswordPolicyError =
  | 'TOO_SHORT'
  | 'INSUFFICIENT_VARIETY'
  | 'CONTAINS_USERNAME';

export const validatePassword = (
  password: string,
  username: string,
): PasswordPolicyError | null => {
  // 모든 비밀번호 규칙 제거
  return null;
};

// ─── username 정책 ─────────────────────────────────────────────────────────
// 영문/숫자/언더스코어/하이픈/점, 3~64자.
export const Username = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'username 은 영숫자/._- 만 허용됩니다');

// ─── 인증 DTO ──────────────────────────────────────────────────────────────
export const LoginDto = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDto>;

export const ChangePasswordDto = z.object({
  current: z.string().min(1),
  next: z.string().min(PASSWORD_MIN_LENGTH),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordDto>;

export const MeResponse = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  globalRole: GlobalRole,
  passwordMustChange: z.boolean(),
  /**
   * 지금 세션이 끊기는 시각(ISO 8601). 화면이 남은 시간을 세고 만료 직전에 연장 창을
   * 띄우는 근거다. 서버 시계를 그대로 내려주므로, 화면은 자기 시계와의 차이를 감안해
   * 남은 시간을 계산해야 한다(lib/session.ts 참고).
   */
  sessionExpiresAt: z.string(),
  /**
   * 응답을 만든 시각(ISO 8601). 남은 시간을 `sessionExpiresAt - serverNow` 로 재고 그 뒤로는
   * 화면이 스스로 흘려보내기 위한 기준점이다.
   *
   * 브라우저 시계를 그대로 믿고 빼면, 사내 PC 시계가 몇 분 어긋나 있을 때 연장 창이 엉뚱한
   * 때에 뜨거나 아예 뜨지 않는다. 두 시각 모두 서버 것이므로 시계 차이가 상쇄된다.
   */
  serverNow: z.string(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** POST /auth/extend 의 응답. 갱신된 만료 시각을 돌려준다. */
export const SessionExtendResponse = z.object({
  sessionExpiresAt: z.string(),
  serverNow: z.string(),
});
export type SessionExtendResponse = z.infer<typeof SessionExtendResponse>;

// ─── 세션 수명 정책 ────────────────────────────────────────────────────────
/**
 * 로그인 한 번으로 유지되는 시간. 조작 여부와 무관하게 로그인 시점부터 잰다.
 *
 * 예전에는 "마지막 조작으로부터 30분(슬라이딩) + 로그인 후 12시간(절대)" 두 겹이었다.
 * 슬라이딩 쪽을 없앤 이유는 두 가지다. 첫째, 서버가 만료를 미뤄도 브라우저 쿠키의 만료는
 * 로그인 시점 값 그대로라 실제로는 30분 만에 끊겼다(쿠키를 다시 내려보내지 않았다).
 * 둘째, 사용자 요청이 "끊기기 전에 물어보고 연장"(관공서 시스템 방식)이라, 조용히 연장되는
 * 슬라이딩과는 맞지 않는다. 지금은 만료 시각이 고정이고 연장은 POST /auth/extend 로만 일어난다.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

/** 만료 몇 분 전부터 연장 창을 띄울지. */
export const SESSION_EXPIRY_WARNING_MS = 10 * 60 * 1000; // 10분

// ─── 사용자 관리 (ADMIN) DTO ───────────────────────────────────────────────
export const CreateUserDto = z.object({
  username: Username,
  displayName: z.string().min(1).max(128),
  initialPassword: z.string().min(PASSWORD_MIN_LENGTH),
});
export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const UpdateUserDto = z
  .object({
    displayName: z.string().min(1).max(128).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => v.displayName !== undefined || v.isActive !== undefined,
    { message: '변경 항목이 없습니다' },
  );
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

export const UserListItem = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  globalRole: GlobalRole,
  isActive: z.boolean(),
  passwordMustChange: z.boolean(),
  lockedUntil: z.string().nullable(), // ISO datetime
  failedLoginCount: z.number().int(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserListItem = z.infer<typeof UserListItem>;

export const ResetPasswordResponse = z.object({
  temporaryPassword: z.string(),
});
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponse>;

// ─── 감사로그 액션 ─────────────────────────────────────────────────────────
export const AuditAction = z.enum([
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGIN_LOCKED',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DEACTIVATE',
  'USER_ACTIVATE',
  'USER_PASSWORD_RESET',
  'USER_UNLOCK',
  'ADMIN_OVERRIDE_EDIT',
  'PROJECT_CREATE',
  'PROJECT_UPDATE',
  'PROJECT_ARCHIVE',
  'PROJECT_RESTORE',
  'PROJECT_DELETE',
  'PROJECT_IMPORT_CSV',
  'PROJECT_CLONE',
  'MEMBER_ADD',
  'MEMBER_REMOVE',
  'MEMBER_ROLE_UPDATE',
  'GROUP_CREATE',
  'GROUP_UPDATE',
  'GROUP_DELETE',
  'GROUP_MEMBER_ADD',
  'GROUP_MEMBER_REMOVE',
  'NODE_CREATE',
  'NODE_UPDATE',
  'NODE_MOVE',
  'NODE_DELETE',
  'AUTOCOMPLETE_CREATE',
  'AUTOCOMPLETE_UPDATE',
  'AUTOCOMPLETE_DELETE',
]);
export type AuditAction = z.infer<typeof AuditAction>;

// ─── 프로젝트 DTO ──────────────────────────────────────────────────────────
export const ImportCsvDto = z.object({
  csvText: z.string(),
});
export type ImportCsvDto = z.infer<typeof ImportCsvDto>;

export const CreateProjectDto = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  managerUserIds: z.array(z.string().min(1)).min(1, '최소 1명의 MANAGER 가 필요합니다'),
  // CloneProjectDto 와 같은 형태. 기본값이 빈 배열이라 기존 호출은 그대로 동작한다.
  memberUserIds: z.array(z.string().min(1)).default([]),
});
export type CreateProjectDto = z.infer<typeof CreateProjectDto>;

export const UpdateProjectDto = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: ProjectStatus.optional(),
    expectedUpdatedAt: z.string(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.status !== undefined,
    { message: '변경 항목이 없습니다' },
  );
export type UpdateProjectDto = z.infer<typeof UpdateProjectDto>;

export const ProjectListItem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
  myRole: ProjectRole.nullable(), // 비멤버(ADMIN 모드)면 null
  memberCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /**
   * 이 프로젝트의 일정이 마지막으로 바뀐 시각(ISO 8601). 일정이 한 번도 바뀐 적 없으면 null.
   *
   * `updatedAt` 과 따로 두는 이유는 두 가지다.
   *  - `updatedAt` 은 프로젝트 행 자체(이름·설명·보관 상태)가 바뀔 때만 움직인다. 일정을
   *    아무리 고쳐도 그대로라, 목록의 "수정일"이 몇 달째 고정돼 보였다.
   *  - 그렇다고 일정 변경 때 프로젝트 행을 건드리면 `expectedUpdatedAt` 동시성 검사(AGENTS.md
   *    §4.5)가 오작동한다. 남이 일정 하나 고친 것만으로 내 이름 변경이 409 로 튕긴다.
   *
   * 그래서 프로젝트 행은 손대지 않고, 일정 이력(node_history)의 최신 시각을 읽어 채운다.
   * 이력 기반이라 삭제된 일정의 변경까지 잡히고, 댓글은 (다른 테이블이므로) 잡히지 않는다 —
   * "댓글은 수정일에 넣지 말라"는 요구와 맞는다.
   */
  lastScheduleChangeAt: z.string().nullable(),
  delaySummary: ProjectDelaySummaryDto.optional(),
});
export type ProjectListItem = z.infer<typeof ProjectListItem>;

/**
 * 목록에 보여줄 "수정일" 하나로 합친다 — 프로젝트 행 변경과 일정 변경 중 더 최근 것.
 * 정렬과 표시가 같은 값을 쓰도록 이 함수 하나만 부른다.
 */
export function projectLastModifiedAt(p: {
  updatedAt: string;
  lastScheduleChangeAt: string | null;
}): string {
  const s = p.lastScheduleChangeAt;
  if (!s) return p.updatedAt;
  // 둘 다 ISO 8601 UTC 문자열이라 사전식 비교가 곧 시간 순서다.
  return s > p.updatedAt ? s : p.updatedAt;
}


export const ProjectDetail = ProjectListItem.extend({
  createdById: z.string(),
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

// ─── 프로젝트 복제 DTO ─────────────────────────────────────────────────────────────────────────────
// dateMode 별 필수 입력이 달라서 superRefine 으로 분기 검증한다.
//  - KEEP: 날짜 입력 없음
//  - SHIFT: newStartDate 필수. 기간·간격은 보존된다
//  - FIT: newStartDate + newEndDate 필수. 기간까지 비례 사상된다
export const CloneProjectDto = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().max(2000).nullable().optional(),
    dateMode: z.enum(['KEEP', 'SHIFT', 'FIT']),
    newStartDate: IsoDate.optional(),
    newEndDate: IsoDate.optional(),
    managerUserIds: z
      .array(z.string().min(1))
      .min(1, '최소 1명의 MANAGER 가 필요합니다'),
    memberUserIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.dateMode !== 'KEEP' && !v.newStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newStartDate'],
        message: '새 시작일을 입력하세요',
      });
    }
    if (v.dateMode === 'FIT') {
      if (!v.newEndDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newEndDate'],
          message: '새 종료일을 입력하세요',
        });
      } else if (v.newStartDate && v.newEndDate < v.newStartDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newEndDate'],
          message: '종료일이 시작일보다 앞설 수 없습니다',
        });
      }
    }
  });
export type CloneProjectDto = z.infer<typeof CloneProjectDto>;

export const CloneProjectResult = z.object({
  project: ProjectDetail,
  nodeCount: z.number().int(),
});
export type CloneProjectResult = z.infer<typeof CloneProjectResult>;

// ─── 멤버 DTO ──────────────────────────────────────────────────────────────
export const AddMemberDto = z.object({
  userId: z.string().min(1),
  role: ProjectRole,
});
export type AddMemberDto = z.infer<typeof AddMemberDto>;

export const UpdateMemberRoleDto = z.object({
  role: ProjectRole,
});
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleDto>;

export const ProjectMemberItem = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: ProjectRole,
  addedAt: z.string(),
  /** 말단 소속 그룹 이름. 소속이 없으면 null. 목록의 배지에 쓴다. */
  groupName: z.string().nullable(),
  /** 최상위부터의 경로. 마우스오버 표시에 쓴다. 소속이 없으면 빈 배열. */
  groupPath: z.array(z.string()),
});
export type ProjectMemberItem = z.infer<typeof ProjectMemberItem>;

// ─── 사용자 그룹 DTO ───────────────────────────────────────────────────────
export const CreateUserGroupDto = z.object({
  name: z.string().min(1).max(64),
  parentId: z.string().min(1).nullable().default(null),
  description: z.string().max(500).nullable().default(null),
});
export type CreateUserGroupDto = z.infer<typeof CreateUserGroupDto>;

export const UpdateUserGroupDto = z
  .object({
    name: z.string().min(1).max(64).optional(),
    parentId: z.string().min(1).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined || v.description !== undefined, {
    message: '변경 항목이 없습니다',
  });
export type UpdateUserGroupDto = z.infer<typeof UpdateUserGroupDto>;

export const UserGroupItem = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  /** 이 그룹에 직접 속한 인원 수. */
  directMemberCount: z.number().int(),
  /** 자손 그룹까지 포함한 인원 수. 화면이 크게 보여 주는 숫자다. */
  totalMemberCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserGroupItem = z.infer<typeof UserGroupItem>;

/**
 * 그룹 목록 조회의 응답. 그룹과 소속을 한 번에 내려보낸다.
 *
 * 둘을 따로 부르면 그 사이에 소속이 바뀌었을 때 화면의 미리보기 인원수가 실제와 어긋난다.
 * 150명 규모라 소속 행이 많아야 수백 개이므로 한 번에 보내도 무해하다.
 */
export const UserGroupTree = z.object({
  groups: z.array(UserGroupItem),
  memberships: z.array(z.object({ groupId: z.string(), userId: z.string() })),
});
export type UserGroupTree = z.infer<typeof UserGroupTree>;

export const GroupMemberItem = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  isActive: z.boolean(),
  addedAt: z.string(),
});
export type GroupMemberItem = z.infer<typeof GroupMemberItem>;

export const AddGroupMembersDto = z.object({
  userIds: z.array(z.string().min(1)).min(1, '한 명 이상을 골라야 합니다'),
  /**
   * true 면 다른 그룹에 이미 속한 사람을 그 그룹에서 빼고 옮긴다.
   * false(기본) 인데 그런 사람이 섞여 있으면 서버가 GROUP_MEMBER_ALREADY_ASSIGNED 로 거부한다.
   */
  move: z.boolean().default(false),
});
export type AddGroupMembersDto = z.infer<typeof AddGroupMembersDto>;

/**
 * 그룹 인원의 프로젝트 참여 현황 집계 한 줄.
 *
 * 이 값은 "이 프로젝트를 이 그룹으로 채웠다"는 기록이 아니라, 지금 겹치는 인원을 보고 역으로
 * 추론한 것이다. 그래서 참여 비율을 함께 담아 화면이 비율 높은 순으로 정렬할 수 있게 한다.
 */
export const GroupProjectCoverage = z.object({
  projectId: z.string(),
  name: z.string(),
  status: ProjectStatus,
  /** 그룹(자손 포함) 인원 수. */
  groupMemberCount: z.number().int(),
  /** 그중 이 프로젝트에 참여 중인 인원 수. */
  participatingCount: z.number().int(),
  /** 그룹 인원 중 이 프로젝트에 없는 사람들. */
  missingUserIds: z.array(z.string()),
});
export type GroupProjectCoverage = z.infer<typeof GroupProjectCoverage>;

// ─── 사용자 기준 권한 DTO ──────────────────────────────────────────────────
export const UserProjectItem = z.object({
  projectId: z.string(),
  name: z.string(),
  status: ProjectStatus,
  role: ProjectRole,
  addedAt: z.string(),
});
export type UserProjectItem = z.infer<typeof UserProjectItem>;

export const AddUserProjectsDto = z.object({
  projectIds: z.array(z.string().min(1)).min(1, '한 개 이상을 골라야 합니다'),
  role: ProjectRole,
});
export type AddUserProjectsDto = z.infer<typeof AddUserProjectsDto>;

export const UpdateUserProjectRoleDto = z.object({
  role: ProjectRole,
});
export type UpdateUserProjectRoleDto = z.infer<typeof UpdateUserProjectRoleDto>;

// ─── 멤버 일괄 추가 DTO ────────────────────────────────────────────────────
export const BulkAddMembersDto = z.object({
  members: z
    .array(z.object({ userId: z.string().min(1), role: ProjectRole }))
    .min(1, '한 명 이상을 골라야 합니다'),
});
export type BulkAddMembersDto = z.infer<typeof BulkAddMembersDto>;

export const BulkAddMembersResult = z.object({
  added: z.number().int(),
  skipped: z.number().int(),
  /** 이미 멤버라서 건너뛴 사람들. */
  skippedUserIds: z.array(z.string()),
});
export type BulkAddMembersResult = z.infer<typeof BulkAddMembersResult>;

// ─── 일정 노드 DTO ─────────────────────────────────────────────────────────
export const Progress = z.number().int().min(0).max(100);
export type Progress = z.infer<typeof Progress>;

export const CreateNodeDto = z
  .object({
    parentId: z.string().min(1).nullable().optional(),
    kind: NodeKind,
    title: z.string().min(1).max(256),
    description: z.string().max(4000).optional(),
    startAt: IsoDate.optional(), // ITEM 만 의미. GROUP 은 무시됨
    endAt: IsoDate.optional(),
    progress: Progress.optional(),  // ITEM 만 의미. GROUP 은 무시됨
  })
  .refine(
    (v) => {
      if (v.startAt && v.endAt) return v.startAt <= v.endAt;
      return true;
    },
    { message: 'startAt 은 endAt 보다 작거나 같아야 합니다' },
  );
export type CreateNodeDto = z.infer<typeof CreateNodeDto>;

export const UpdateNodeDto = z
  .object({
    title: z.string().min(1).max(256).optional(),
    description: z.string().max(4000).nullable().optional(),
    startAt: IsoDate.nullable().optional(),
    endAt: IsoDate.nullable().optional(),
    progress: Progress.optional(),
    expectedUpdatedAt: z.string(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.startAt !== undefined ||
      v.endAt !== undefined ||
      v.progress !== undefined,
    { message: '변경 항목이 없습니다' },
  )
  .refine(
    (v) => {
      if (v.startAt && v.endAt) return v.startAt <= v.endAt;
      return true;
    },
    { message: 'startAt 은 endAt 보다 작거나 같아야 합니다' },
  );
export type UpdateNodeDto = z.infer<typeof UpdateNodeDto>;

export const MoveNodeDto = z.object({
  newParentId: z.string().min(1).nullable(),
  newSortOrder: z.number().int().nonnegative(),
  expectedUpdatedAt: z.string(),
});
export type MoveNodeDto = z.infer<typeof MoveNodeDto>;

export const NodeTreeItem = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  kind: NodeKind,
  title: z.string(),
  description: z.string().nullable(),
  startAt: z.string().nullable(),       // ITEM: 직접 입력값 / GROUP: null
  endAt: z.string().nullable(),
  startAtEffective: z.string().nullable(), // GROUP: 자동집계, ITEM: startAt 동일
  endAtEffective: z.string().nullable(),
  progress: z.number().int(),                    // ITEM: 직접 입력값 / GROUP: 0 (참고용, UI 는 progressEffective 사용)
  progressEffective: z.number().int().nullable(), // ITEM: progress 동일 / GROUP: 자손 ITEM 단순평균(반올림). 자손 ITEM 0개면 null
  sortOrder: z.number().int(),
  depth: z.number().int(),
  createdById: z.string(),
  updatedById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NodeTreeItem = z.infer<typeof NodeTreeItem>;

// ─── 댓글 DTO ──────────────────────────────────────────────────────────────
export const CreateCommentDto = z.object({
  body: z.string().min(1).max(4000),
});
export type CreateCommentDto = z.infer<typeof CreateCommentDto>;

export const NodeCommentItem = z.object({
  id: z.string(),
  nodeId: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  authorDisplayName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NodeCommentItem = z.infer<typeof NodeCommentItem>;

// ─── 노드 히스토리 ─────────────────────────────────────────────────────────
export const NodeHistoryItem = z.object({
  id: z.string(),
  nodeIdSnapshot: z.string(),         // 원본 nodeId — 노드 삭제 후에도 유지
  projectIdSnapshot: z.string(),
  actorId: z.string(),
  actorUsername: z.string(),
  actorDisplayName: z.string(),
  action: NodeAction,
  diff: z.record(z.unknown()),        // { field: { from, to } } 또는 자유 형식
  occurredAt: z.string(),
});
export type NodeHistoryItem = z.infer<typeof NodeHistoryItem>;

// ─── 동시성 충돌 응답 ──────────────────────────────────────────────────────
export const ConflictResponse = z.object({
  code: z.literal('CONFLICT'),
  message: z.string(),
  currentUpdatedAt: z.string(),
});
export type ConflictResponse = z.infer<typeof ConflictResponse>;

// ─── 자동완성 DTO ──────────────────────────────────────────────────────────
export const AutocompleteTermDto = z.object({
  id: z.string(),
  title: z.string().min(1).max(256),
  kind: NodeKind,
  isSystem: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AutocompleteTermDto = z.infer<typeof AutocompleteTermDto>;

export const CreateAutocompleteTermDto = z.object({
  title: z.string().min(1).max(256),
  kind: NodeKind,
});
export type CreateAutocompleteTermDto = z.infer<typeof CreateAutocompleteTermDto>;

export const UpdateAutocompleteTermDto = z.object({
  title: z.string().min(1).max(256),
});
export type UpdateAutocompleteTermDto = z.infer<typeof UpdateAutocompleteTermDto>;

// ─── 프로젝트 이력 조회 ─────────────────────────────────────────────────────
import {
  HISTORY_TOPICS,
  HISTORY_RANGES,
} from './history-utils';

// history-utils 의 순수 함수·데이터 타입을 그대로 재노출 (백엔드·프론트 공용)
export * from './history-utils';

// 프로젝트 복제용 날짜 재매핑 함수도 같은 이유로 재노출 (API 계산 = web 미리보기)
export * from './clone-dates';

export const HistoryTopic = z.enum(HISTORY_TOPICS);
export type HistoryTopic = z.infer<typeof HistoryTopic>;

export const HistoryRange = z.enum(HISTORY_RANGES);
export type HistoryRange = z.infer<typeof HistoryRange>;

export const ProjectHistoryQuery = z
  .object({
    topic: HistoryTopic.default('ALL'),
    range: HistoryRange.default('1m'),
    from: IsoDate.optional(), // range='custom' 일 때만
    to: IsoDate.optional(),
  })
  .refine((v) => v.range !== 'custom' || (!!v.from && !!v.to), {
    message: 'custom 범위는 from/to 가 필요합니다',
    path: ['from'],
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: 'from 은 to 보다 작거나 같아야 합니다',
    path: ['to'],
  });
export type ProjectHistoryQuery = z.infer<typeof ProjectHistoryQuery>;

export const ProjectHistoryEntry = z.discriminatedUnion('type', [
  NodeHistoryItem.extend({
    type: z.literal('HISTORY'),
    nodeTitle: z.string(),
    nodeDeleted: z.boolean(),
  }),
  NodeCommentItem.extend({
    type: z.literal('COMMENT'),
    nodeTitle: z.string(),
    nodeDeleted: z.boolean(),
  }),
]);
export type ProjectHistoryEntry = z.infer<typeof ProjectHistoryEntry>;

export const ProjectHistoryResponse = z.object({
  items: z.array(ProjectHistoryEntry),
  truncated: z.boolean(),
});
export type ProjectHistoryResponse = z.infer<typeof ProjectHistoryResponse>;

// 예상 진척률 (Expected Progress) 계산 유틸리티 재노출
export * from './expected-progress';


