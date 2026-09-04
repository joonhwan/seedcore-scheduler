import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateUserDto,
  ResetPasswordResponse,
  UpdateUserDto,
  UserActivitySummary,
  UserListItem,
} from '@sam/shared';
import { api } from './api';

export type UserListStatus = 'active' | 'inactive' | 'all';

export const usersKey = (opts: {
  query: string;
  status: UserListStatus;
  includeRetired: boolean;
}) => ['admin', 'users', opts] as const;

export function useUsers(opts?: {
  query?: string;
  status?: UserListStatus;
  includeRetired?: boolean;
}) {
  const query = opts?.query ?? '';
  const status: UserListStatus = opts?.status ?? 'active';
  const includeRetired = opts?.includeRetired ?? false;
  return useQuery<UserListItem[]>({
    queryKey: usersKey({ query, status, includeRetired }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('status', status);
      if (includeRetired) params.set('includeRetired', '1');
      const qs = params.toString();
      return api.get<UserListItem[]>(`/admin/users${qs ? `?${qs}` : ''}`);
    },
  });
}

export const userActivityKey = (id: string) => ['admin', 'users', id, 'activity'] as const;

/**
 * 계정 하나의 활동 집계. 삭제 버튼을 띄울지 판단하는 근거다.
 *
 * 프로젝트 참여나 그룹 소속을 이 화면에서 빼면 집계가 달라지므로, 그 조작들이
 * ['admin', 'users'] 를 무효화할 때 이 쿼리도 함께 다시 읽힌다.
 */
export function useUserActivity(id: string) {
  return useQuery<UserActivitySummary>({
    queryKey: userActivityKey(id),
    queryFn: () => api.get<UserActivitySummary>(`/admin/users/${id}/activity`),
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

export function useRetireUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<UserListItem>(`/admin/users/${id}/retire`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUnretireUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<UserListItem>(`/admin/users/${id}/unretire`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/users/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}
