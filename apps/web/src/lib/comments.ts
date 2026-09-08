import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCommentDto, NodeCommentItem } from '@sam/shared';
import { api } from './api';
import { projectHistoryKeyPrefix } from './projectHistory';

export const commentsKey = (nodeId: string) => ['nodes', nodeId, 'comments'] as const;

/**
 * 댓글을 달거나 지우면 그 노드의 댓글 목록뿐 아니라 **프로젝트 이력 화면**도 함께 갱신해야 한다.
 *
 * 이력 화면은 ['projects', projectId, 'history', 필터] 키를 쓰는데, 댓글 키(['nodes', ...])와
 * 접두가 겹치지 않아 저절로 걸리지 않는다. 일정 변경 쪽은 invalidateProject() 가
 * ['projects', id] 를 무효화하면서 접두 일치로 이력까지 함께 걸리지만, 댓글 경로에는 그런
 * 무효화가 없어 방금 단 댓글이 이력 목록에 늦게 나타났다.
 */
function invalidateAfterCommentChange(
  qc: ReturnType<typeof useQueryClient>,
  nodeId: string,
  projectId: string,
) {
  qc.invalidateQueries({ queryKey: commentsKey(nodeId) });
  qc.invalidateQueries({ queryKey: projectHistoryKeyPrefix(projectId) });
}

export function useComments(nodeId: string | undefined) {
  return useQuery<NodeCommentItem[]>({
    queryKey: nodeId ? commentsKey(nodeId) : ['nodes', '__none__', 'comments'],
    queryFn: () => api.get<NodeCommentItem[]>(`/nodes/${nodeId}/comments`),
    enabled: !!nodeId,
  });
}

export function useAddComment(nodeId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentDto) =>
      api.post<NodeCommentItem>(`/nodes/${nodeId}/comments`, input),
    onSuccess: () => invalidateAfterCommentChange(qc, nodeId, projectId),
  });
}

export function useDeleteComment(nodeId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
    onSuccess: () => invalidateAfterCommentChange(qc, nodeId, projectId),
  });
}
