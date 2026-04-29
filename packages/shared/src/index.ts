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

export const LoginDto = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDto>;

export const ChangePasswordDto = z.object({
  current: z.string().min(1),
  next: z.string().min(10),
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

export const MAX_TREE_DEPTH = 5;
