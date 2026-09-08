import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { ProjectHistoryQuery, ProjectHistoryResponse } from '@sam/shared';
import { api } from './api';

export const projectHistoryKey = (projectId: string, q: ProjectHistoryQuery) =>
  ['projects', projectId, 'history', q] as const;

/**
 * 필터 조합(q)에 관계없이 그 프로젝트의 이력 쿼리를 모두 가리키는 접두 키.
 * 무효화·제거는 주어진 키로 시작하는 쿼리를 찾으므로, 이 키 하나로 기간·주제 조합 전부가 걸린다.
 */
export const projectHistoryKeyPrefix = (projectId: string) =>
  ['projects', projectId, 'history'] as const;

/**
 * 이력 캐시를 **무효화가 아니라 제거**한다.
 *
 * 무효화만 하면 다음에 이력 화면에 들어갈 때 캐시된 옛 목록이 먼저 그려지고 그 뒤에 새 응답이
 * 도착한다. 이력 화면은 "지금 이 순간의 사실"을 보러 오는 곳이라 그 짧은 구간이 그대로
 * 오해가 된다 — 방금 남긴 댓글이 없는 목록을 보고 새로고침을 누르게 된다. 캐시를 지워 두면
 * 그 자리에 빈 목록 대신 "불러오는 중"이 뜨므로, 옛 목록을 최신으로 착각할 여지가 없다.
 *
 * 이력 화면 자체에는 데이터를 바꾸는 조작이 없으므로, 보고 있는 목록이 갑자기 사라질 일은 없다.
 */
export function dropProjectHistoryCache(qc: QueryClient, projectId: string) {
  qc.removeQueries({ queryKey: projectHistoryKeyPrefix(projectId) });
}

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
