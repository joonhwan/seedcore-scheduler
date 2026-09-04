import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddUserProjectsDto, ProjectRole, UserGroupItem, UserProjectItem } from '@sam/shared';
import { api } from './api';
import { userActivityKey } from './users';

export const userProjectsKey = (userId: string) => ['admin', 'users', userId, 'projects'] as const;
export const userGroupsKey = (userId: string) => ['admin', 'users', userId, 'groups'] as const;

export interface AddUserProjectsResult {
  added: number;
  skipped: number;
  skippedProjectIds: string[];
}

export function useUserProjects(userId: string | undefined) {
  return useQuery<UserProjectItem[]>({
    queryKey: userId ? userProjectsKey(userId) : ['admin', 'users', '__none__'],
    queryFn: () => api.get<UserProjectItem[]>(`/admin/users/${userId}/projects`),
    enabled: !!userId,
  });
}

export function useUserGroups(userId: string | undefined) {
  return useQuery<UserGroupItem[]>({
    queryKey: userId ? userGroupsKey(userId) : ['admin', 'users', '__none__', 'groups'],
    queryFn: () => api.get<UserGroupItem[]>(`/admin/users/${userId}/groups`),
    enabled: !!userId,
  });
}

function invalidateUser(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: userProjectsKey(userId) });
  qc.invalidateQueries({ queryKey: ['projects'] });
  // 참여 프로젝트 수가 활동 집계(clearable.projectMemberships)에 들어가므로 함께 무효화한다.
  // ['admin','users',userId,'projects'] 무효화는 접두어가 달라 activity 키까지 덮지 않는다.
  qc.invalidateQueries({ queryKey: userActivityKey(userId) });
}

export function useAddUserProjects(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddUserProjectsDto) =>
      api.post<AddUserProjectsResult>(`/admin/users/${userId}/projects`, input),
    onSuccess: () => invalidateUser(qc, userId),
  });
}

export function useUpdateUserProjectRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, role }: { projectId: string; role: ProjectRole }) =>
      api.patch<UserProjectItem>(`/admin/users/${userId}/projects/${projectId}`, {
        role,
      }),
    onSuccess: () => invalidateUser(qc, userId),
  });
}

export function useRemoveUserProject(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.delete<void>(`/admin/users/${userId}/projects/${projectId}`),
    onSuccess: () => invalidateUser(qc, userId),
  });
}
