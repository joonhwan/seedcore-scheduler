import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddMemberDto,
  BulkAddMembersDto,
  BulkAddMembersResult,
  BulkRemoveMembersDto,
  BulkRemoveMembersResult,
  ProjectMemberItem,
  ProjectRole,
} from '@sam/shared';
import { api } from './api';
import { projectKey } from './projects';

export const membersKey = (projectId: string) => ['projects', projectId, 'members'] as const;

export function useMembers(projectId: string | undefined) {
  return useQuery<ProjectMemberItem[]>({
    queryKey: projectId ? membersKey(projectId) : ['projects', '__none__', 'members'],
    queryFn: () => api.get<ProjectMemberItem[]>(`/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

/**
 * 여러 프로젝트의 MANAGER 목록을 한 번에 읽는다.
 *
 * 그룹 소속을 바꾼 뒤 여는 동기화 대화상자가 "이 사람을 빼면 MANAGER 가 한 명도 남지
 * 않는" 프로젝트를 미리 가려내는 데 쓴다. 대상이 몇 건 규모라 프로젝트마다 한 번씩 부른다.
 */
export async function fetchProjectManagers(projectIds: string[]): Promise<Map<string, string[]>> {
  const entries = await Promise.all(
    projectIds.map(async (projectId) => {
      const members = await api.get<ProjectMemberItem[]>(`/projects/${projectId}/members`);
      return [projectId, members.filter((m) => m.role === 'MANAGER').map((m) => m.userId)] as const;
    }),
  );
  return new Map(entries);
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

export function useAddMembersBulk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAddMembersDto) =>
      api.post<BulkAddMembersResult>(`/projects/${projectId}/members/bulk`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/**
 * 여러 명을 한꺼번에 뺀다.
 *
 * 개별 DELETE 를 여러 번 부르지 않는 이유는 서버 쪽 removeBulk 의 주석에 적어 두었다 —
 * 마지막 MANAGER 검사가 호출 순서에 좌우되기 때문이다.
 */
export function useRemoveMembersBulk(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkRemoveMembersDto) =>
      api.post<BulkRemoveMembersResult>(`/projects/${projectId}/members/bulk-remove`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateMemberRole(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      api.patch<ProjectMemberItem>(`/projects/${projectId}/members/${userId}`, { role }),
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
    mutationFn: (userId: string) => api.delete<void>(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: membersKey(projectId) });
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
