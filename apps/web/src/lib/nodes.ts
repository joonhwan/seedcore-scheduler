import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateNodeDto,
  MoveNodeDto,
  NodeTreeItem,
  UpdateNodeDto,
} from '@sam/shared';
import { api } from './api';
import { projectKey } from './projects';

export const nodesKey = (projectId: string) =>
  ['projects', projectId, 'nodes'] as const;

export function useNodes(projectId: string | undefined) {
  return useQuery<NodeTreeItem[]>({
    queryKey: projectId ? nodesKey(projectId) : ['projects', '__none__', 'nodes'],
    queryFn: () => api.get<NodeTreeItem[]>(`/projects/${projectId}/nodes`),
    enabled: !!projectId,
  });
}

function invalidateProject(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  qc.invalidateQueries({ queryKey: nodesKey(projectId) });
  qc.invalidateQueries({ queryKey: projectKey(projectId) });
}

export function useCreateNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNodeDto) =>
      api.post<NodeTreeItem>(`/projects/${projectId}/nodes`, input),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useUpdateNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateNodeDto }) =>
      api.patch<NodeTreeItem>(`/nodes/${id}`, body),
    onSuccess: (_data, vars) => {
      invalidateProject(qc, projectId);
      qc.invalidateQueries({ queryKey: ['nodes', vars.id, 'history'] });
    },
  });
}

export function useMoveNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoveNodeDto }) =>
      api.post<NodeTreeItem>(`/nodes/${id}/move`, body),
    onSuccess: (_data, vars) => {
      invalidateProject(qc, projectId);
      qc.invalidateQueries({ queryKey: ['nodes', vars.id, 'history'] });
    },
  });
}

export function useDeleteNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/nodes/${id}`),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}
