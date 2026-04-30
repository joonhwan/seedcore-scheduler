import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordDto, LoginDto, MeResponse } from '@sam/shared';
import { api, ApiError } from './api';

const ME_KEY = ['auth', 'me'] as const;

export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginDto) =>
      api.post<{ passwordMustChange: boolean }>('/auth/login', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordDto) =>
      api.post<void>('/auth/change-password', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}
