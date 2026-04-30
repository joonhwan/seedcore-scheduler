import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddMemberDto, ProjectMemberItem } from '@sam/shared';
import { api } from './api';
import { projectKey } from './projects';

export const membersKey = (projectId: string) =>
  ['projects', projectId, 'members'] as const;

export function useMembers(projectId: string | undefined) {
  return useQuery<ProjectMemberItem[]>({
    queryKey: projectId ? membersKey(projectId) : ['projects', '__none__', 'members'],
    queryFn: () => api.get<ProjectMemberItem[]>(`/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

export function useAddMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberDto) =>
      api.post<ProjectMemberItem>(`/projects/${projectId}/members`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<void>(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
