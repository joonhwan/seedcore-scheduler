import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AutocompleteTermDto,
  CreateAutocompleteTermDto,
  UpdateAutocompleteTermDto,
} from '@sam/shared';
import { api } from './api';

export const autocompleteKey = (opts: { kind?: 'GROUP' | 'ITEM' | undefined; query?: string | undefined }) =>
  ['autocomplete', opts] as const;

export const adminAutocompleteKey = (opts: {
  kind?: 'GROUP' | 'ITEM' | undefined;
  query?: string | undefined;
  isSystem?: boolean | undefined;
}) => ['admin', 'autocomplete', opts] as const;

// 1. 일반 사용자용 자동완성 목록 조회
export function useAutocompleteTerms(opts?: { kind?: 'GROUP' | 'ITEM' | undefined; query?: string | undefined }) {
  const kind = opts?.kind;
  const query = opts?.query ?? '';
  return useQuery<AutocompleteTermDto[]>({
    queryKey: autocompleteKey({ kind, query }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (kind) params.set('kind', kind);
      if (query) params.set('query', query);
      const qs = params.toString();
      return api.get<AutocompleteTermDto[]>(`/autocomplete${qs ? `?${qs}` : ''}`);
    },
  });
}

// 2. 관리자용 전체 자동완성 목록 조회
export function useAdminAutocompleteTerms(opts?: {
  kind?: 'GROUP' | 'ITEM' | undefined;
  query?: string | undefined;
  isSystem?: boolean | undefined;
}) {
  const kind = opts?.kind;
  const query = opts?.query ?? '';
  const isSystem = opts?.isSystem;

  return useQuery<AutocompleteTermDto[]>({
    queryKey: adminAutocompleteKey({ kind, query, isSystem }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (kind) params.set('kind', kind);
      if (query) params.set('query', query);
      if (isSystem !== undefined) params.set('isSystem', String(isSystem));
      const qs = params.toString();
      return api.get<AutocompleteTermDto[]>(`/admin/autocomplete${qs ? `?${qs}` : ''}`);
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'autocomplete'] });
  qc.invalidateQueries({ queryKey: ['autocomplete'] });
}

// 3. 관리자: 신규 수동(고정) 항목 생성
export function useCreateAutocompleteTerm() {
  const qc = useQueryClient();
  return useMutation({
    onSuccess: () => invalidateAll(qc),
    mutationFn: (input: CreateAutocompleteTermDto) =>
      api.post<AutocompleteTermDto>('/admin/autocomplete', input),
  });
}

// 4. 관리자: 항목 수정
export function useUpdateAutocompleteTerm() {
  const qc = useQueryClient();
  return useMutation({
    onSuccess: () => invalidateAll(qc),
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAutocompleteTermDto }) =>
      api.patch<AutocompleteTermDto>(`/admin/autocomplete/${id}`, patch),
  });
}

// 5. 관리자: 항목 삭제
export function useDeleteAutocompleteTerm() {
  const qc = useQueryClient();
  return useMutation({
    onSuccess: () => invalidateAll(qc),
    mutationFn: (id: string) =>
      api.delete<void>(`/admin/autocomplete/${id}`),
  });
}

// 6. 관리자: 수동 동기화 실행
export function useSyncAutocompleteTerms() {
  const qc = useQueryClient();
  return useMutation({
    onSuccess: () => invalidateAll(qc),
    mutationFn: () => api.post<void>('/admin/autocomplete/sync', {}),
  });
}
