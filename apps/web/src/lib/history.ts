import { useQuery } from '@tanstack/react-query';
import type { NodeHistoryItem } from '@sam/shared';
import { api } from './api';

export const historyKey = (nodeId: string) => ['nodes', nodeId, 'history'] as const;

export function useNodeHistory(nodeId: string | undefined) {
  return useQuery<NodeHistoryItem[]>({
    queryKey: nodeId ? historyKey(nodeId) : ['nodes', '__none__', 'history'],
    queryFn: () => api.get<NodeHistoryItem[]>(`/nodes/${nodeId}/history`),
    enabled: !!nodeId,
  });
}
