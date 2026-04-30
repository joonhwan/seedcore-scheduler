import { useQuery } from '@tanstack/react-query';
import type { UserListItem } from '@sam/shared';
import { api } from './api';

export type UserListStatus = 'active' | 'inactive' | 'all';

export function useUsers(opts?: { query?: string; status?: UserListStatus }) {
  const query = opts?.query ?? '';
  const status: UserListStatus = opts?.status ?? 'active';
  return useQuery<UserListItem[]>({
    queryKey: ['admin', 'users', { query, status }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('status', status);
      const qs = params.toString();
      return api.get<UserListItem[]>(`/admin/users${qs ? `?${qs}` : ''}`);
    },
  });
}
