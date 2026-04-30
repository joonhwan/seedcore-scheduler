import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCommentDto, NodeCommentItem } from '@sam/shared';
import { api } from './api';

export const commentsKey = (nodeId: string) => ['nodes', nodeId, 'comments'] as const;

export function useComments(nodeId: string | undefined) {
  return useQuery<NodeCommentItem[]>({
    queryKey: nodeId ? commentsKey(nodeId) : ['nodes', '__none__', 'comments'],
    queryFn: () => api.get<NodeCommentItem[]>(`/nodes/${nodeId}/comments`),
    enabled: !!nodeId,
  });
}

export function useAddComment(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentDto) =>
      api.post<NodeCommentItem>(`/nodes/${nodeId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentsKey(nodeId) }),
  });
}

export function useDeleteComment(nodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete<void>(`/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentsKey(nodeId) }),
  });
}
