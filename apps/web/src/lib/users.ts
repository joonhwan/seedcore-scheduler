import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkImportResult,
  BulkImportUsersDto,
  CreateUserDto,
  ResetPasswordResponse,
  UpdateUserDto,
  UserActivitySummary,
  UserListItem,
} from '@sam/shared';
import { api } from './api';
import { groupsKey } from './groups';

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
 * 프로젝트 참여나 그룹 소속을 이 화면에서 빼면 집계가 달라진다. TanStack Query 의 무효화는
 * 접두어 매칭이라 `['admin','users',id,'projects']`·`['admin','users',id,'groups']` 를
 * 무효화해도 이 쿼리 키(`['admin','users',id,'activity']`)는 마지막 조각이 달라 덮이지
 * 않는다. 그래서 그 조작들(`lib/userProjects.ts` 의 `invalidateUser()`,
 * `AdminUserDetailPage` 의 소속 이동, `GroupProjectSyncDialog` 의 프로젝트 참여 동기화)이
 * 각자 `userActivityKey(id)` 를 함께 무효화한다.
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

/**
 * 일괄 등록. 미리보기(dryRun: true)와 적용(dryRun: false)이 같은 엔드포인트다.
 *
 * 미리보기는 아무것도 바꾸지 않지만 POST 라서 mutation 으로 둔다. 화면이 "확인" 을 눌렀을
 * 때만 부르고 결과를 자기 상태로 들고 있으므로, 쿼리 캐시에 담을 이유가 없다.
 */
export function useBulkImportUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkImportUsersDto) =>
      api.post<BulkImportResult>('/admin/users/bulk-import', input),
    onSuccess: (result) => {
      // 미리보기는 아무것도 바꾸지 않았으므로 다시 읽을 이유가 없다.
      if (result.applied) {
        invalidateAll(qc);
        qc.invalidateQueries({ queryKey: groupsKey });
      }
    },
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
