import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddGroupMembersDto,
  CreateUserGroupDto,
  GroupMemberItem,
  GroupProjectCoverage,
  UpdateUserGroupDto,
  UserGroupItem,
  UserGroupTree,
} from '@sam/shared';
import { api } from './api';

export const groupsKey = ['admin', 'groups'] as const;
export const groupMembersKey = (groupId: string) =>
  ['admin', 'groups', groupId, 'members'] as const;

/** 그룹과 소속을 한 번에 받는다. 둘을 따로 부르면 미리보기 인원수가 실제와 어긋난다. */
export function useGroupTree(enabled = true) {
  return useQuery<UserGroupTree>({
    queryKey: groupsKey,
    queryFn: () => api.get<UserGroupTree>('/admin/groups'),
    enabled,
  });
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery<GroupMemberItem[]>({
    queryKey: groupId ? groupMembersKey(groupId) : ['admin', 'groups', '__none__'],
    queryFn: () => api.get<GroupMemberItem[]>(`/admin/groups/${groupId}/members`),
    enabled: !!groupId,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: groupsKey });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserGroupDto) => api.post<UserGroupItem>('/admin/groups', input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateUserGroupDto }) =>
      api.patch<UserGroupItem>(`/admin/groups/${id}`, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/groups/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddGroupMembers(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddGroupMembersDto) =>
      api.post<GroupMemberItem[]>(`/admin/groups/${groupId}/members`, input),
    onSuccess: () => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: groupMembersKey(groupId) });
      // 사용자 목록은 다시 부르지 않는다. UserItem 에는 그룹 정보가 없고, 사용자 관리 화면의
      // 소속 배지는 useGroupTree(=groupsKey)에서 따로 만들기 때문이다. 예전에는 여기서
      // 함께 무효화해 소속을 바꿀 때마다 쓸모없는 조회가 한 건씩 더 나갔다.
    },
  });
}

export const groupProjectsKey = (groupId: string) =>
  ['admin', 'groups', groupId, 'projects'] as const;

export function useGroupProjects(groupId: string | undefined) {
  return useQuery<GroupProjectCoverage[]>({
    queryKey: groupId ? groupProjectsKey(groupId) : ['admin', 'groups', '__none__', 'projects'],
    queryFn: () => api.get<GroupProjectCoverage[]>(`/admin/groups/${groupId}/projects`),
    enabled: !!groupId,
  });
}

export function useRemoveGroupMember(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`/admin/groups/${groupId}/members/${userId}`),
    onSuccess: () => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: groupMembersKey(groupId) });
      // 사용자 목록은 다시 부르지 않는다. UserItem 에는 그룹 정보가 없고, 사용자 관리 화면의
      // 소속 배지는 useGroupTree(=groupsKey)에서 따로 만들기 때문이다. 예전에는 여기서
      // 함께 무효화해 소속을 바꿀 때마다 쓸모없는 조회가 한 건씩 더 나갔다.
    },
  });
}
