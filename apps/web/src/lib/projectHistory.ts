import { useQuery } from '@tanstack/react-query';
import type { ProjectHistoryQuery, ProjectHistoryResponse } from '@sam/shared';
import { api } from './api';

export const projectHistoryKey = (projectId: string, q: ProjectHistoryQuery) =>
  ['projects', projectId, 'history', q] as const;

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
