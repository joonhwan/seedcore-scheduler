import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordDto, LoginDto, MeResponse, UpdateMeDto } from '@sam/shared';
import { api, ApiError } from './api';

const ME_KEY = ['auth', 'me'] as const;

/**
 * 서버에 물어보지 못했을 때 다시 시도하는 간격.
 *
 * 재시작이 끝나면 사용자가 아무것도 하지 않아도 원래 화면으로 돌아오게 하는 값이다.
 */
const ME_RETRY_ON_ERROR_MS = 3_000;

/**
 * 지금 로그인한 사람. 세 상태를 구분해서 돌려준다.
 *
 *  - `data` 가 있으면 로그인 상태.
 *  - `data` 가 `null` 이면 **서버가 401 로 답했다** — 로그아웃이 확인된 것이다.
 *  - `isError` 면 **서버에 물어보지 못했다**(5xx·연결 실패). 로그인 여부를 알 수 없는 것이지
 *    로그아웃된 것이 아니다.
 *
 * 뒤의 둘을 섞으면 안 된다. 서버가 재시작되는 동안 새로고침한 사용자를 로그인 화면으로
 * 보내면, 세션과 쿠키가 멀쩡한데도 다시 로그인해야 하는 것처럼 보인다. 재시작 예고를 보고
 * 기다린 사용자에게 특히 아프다. 판정은 App.tsx 의 RequireAuth 가 한다.
 */
export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/auth/me');
      } catch (err) {
        // 401 만 "로그아웃" 으로 본다. 그 밖의 실패는 그대로 올려보내 isError 가 되게 한다.
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
    // 서버가 돌아오면 저절로 복구되게 한다. 성공한 뒤에는 이 간격이 돌지 않는다.
    refetchInterval: (query) => (query.state.status === 'error' ? ME_RETRY_ON_ERROR_MS : false),
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

/**
 * 본인 표시 이름 변경.
 *
 * 성공하면 me 를 무효화해서 헤더에 걸린 이름이 바로 따라오게 한다.
 */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeDto) => api.patch<void>('/auth/me', input),
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
