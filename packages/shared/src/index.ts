import { z } from 'zod';

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

export const MAX_TREE_DEPTH = 5;

// ─── 비밀번호 정책 (DESIGN §4.1) ────────────────────────────────────────────
// 최소 10자, 영문/숫자/특수 중 3종 이상, 동일 username 포함 금지.
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordPolicyError =
  | 'TOO_SHORT'
  | 'INSUFFICIENT_VARIETY'
  | 'CONTAINS_USERNAME';

export const validatePassword = (
  password: string,
  username: string,
): PasswordPolicyError | null => {
  if (password.length < PASSWORD_MIN_LENGTH) return 'TOO_SHORT';
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const variety = [hasLetter, hasDigit, hasSpecial].filter(Boolean).length;
  if (variety < 3) return 'INSUFFICIENT_VARIETY';
  if (
    username.length > 0 &&
    password.toLowerCase().includes(username.toLowerCase())
  ) {
    return 'CONTAINS_USERNAME';
  }
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
});
export type MeResponse = z.infer<typeof MeResponse>;

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
]);
export type AuditAction = z.infer<typeof AuditAction>;
