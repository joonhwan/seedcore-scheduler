import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateUserDto,
  ResetPasswordResponse,
  UpdateUserDto,
  UserListItem,
} from '@sam/shared';
import { api } from './api';

export type UserListStatus = 'active' | 'inactive' | 'all';

export const usersKey = (opts: { query: string; status: UserListStatus }) =>
  ['admin', 'users', opts] as const;

export function useUsers(opts?: { query?: string; status?: UserListStatus }) {
  const query = opts?.query ?? '';
  const status: UserListStatus = opts?.status ?? 'active';
  return useQuery<UserListItem[]>({
    queryKey: usersKey({ query, status }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('status', status);
      const qs = params.toString();
      return api.get<UserListItem[]>(`/admin/users${qs ? `?${qs}` : ''}`);
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'users'] });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserDto) =>
      api.post<UserListItem>('/admin/users', input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateUserDto }) =>
      api.patch<UserListItem>(`/admin/users/${id}`, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ResetPasswordResponse>(`/admin/users/${id}/reset-password`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/admin/users/${id}/unlock`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}
