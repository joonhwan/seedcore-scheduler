import { useQuery } from '@tanstack/react-query';
import type { ProjectHistoryQuery, ProjectHistoryResponse } from '@sam/shared';
import { api } from './api';

export const projectHistoryKey = (projectId: string, q: ProjectHistoryQuery) =>
  ['projects', projectId, 'history', q] as const;

/**
 * 필터 조합(q)에 관계없이 그 프로젝트의 이력 쿼리를 모두 가리키는 접두 키.
 * 무효화는 주어진 키로 시작하는 쿼리를 찾으므로, 이 키 하나로 기간·주제 조합 전부가 걸린다.
 */
export const projectHistoryKeyPrefix = (projectId: string) =>
  ['projects', projectId, 'history'] as const;

export function useProjectHistory(projectId: string | undefined, q: ProjectHistoryQuery) {
  return useQuery<ProjectHistoryResponse>({
    queryKey: projectId ? projectHistoryKey(projectId, q) : ['projects', '__none__', 'history'],
    queryFn: () => {
      const params = new URLSearchParams({ topic: q.topic, range: q.range });
      if (q.range === 'custom' && q.from && q.to) {
        params.set('from', q.from);
        params.set('to', q.to);
      }
      return api.get<ProjectHistoryResponse>(`/projects/${projectId}/history?${params.toString()}`);
    },
    enabled: !!projectId,
  });
}
