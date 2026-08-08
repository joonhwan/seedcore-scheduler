import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NodeTreeItem,
  CloneProjectDto,
  CloneProjectResult,
  CreateProjectDto,
  ProjectDetail,
  ProjectListItem,
  ProjectStatus,
  UpdateProjectDto,
} from '@sam/shared';
import { api } from './api';

export const projectsKey = ['projects'] as const;
export const projectKey = (id: string) => ['projects', id] as const;

export function useProjects() {
  return useQuery<ProjectListItem[]>({
    queryKey: projectsKey,
    queryFn: () => api.get<ProjectListItem[]>('/projects'),
  });
}

export function useProject(id: string | undefined) {
  return useQuery<ProjectDetail>({
    queryKey: id ? projectKey(id) : ['projects', '__none__'],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectDto) =>
      api.post<ProjectDetail>('/admin/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectDto) =>
      api.patch<ProjectDetail>(`/admin/projects/${id}`, input),
    onSuccess: (data) => {
      qc.setQueryData(projectKey(id), data);
      // invalidateQueries 의 프라미스를 돌려줘야 목록이 실제로 다시 받아올 때까지
      // mutation 이 pending 으로 남는다. 돌려주지 않으면 재요청이 도착하기 전에
      // 성공 토스트가 뜨고, 그 짧은 창에서 다시 누르면 낡은 expectedUpdatedAt 으로
      // 409 가 난다.
      return qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

export function useSetProjectStatus(id: string) {
  const update = useUpdateProject(id);
  return {
    ...update,
    mutateAsync: (input: { status: ProjectStatus; expectedUpdatedAt: string }) =>
      update.mutateAsync(input),
  };
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/admin/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}

export function useImportCsv(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { csvText: string }) =>
      api.post<NodeTreeItem[]>(`/projects/${projectId}/import-csv`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'nodes'] });
      // 프로젝트 자체도 무효화해야 한다 — 가져오기는 일정을 전량 교체하므로 헤더의 진척율·
      // 지연 요약과 updatedAt 이 모두 달라진다. 이게 없으면 트리만 갱신되고 헤더는 옛 값이
      // 남아, 방금 가져온 일정과 상단 배지가 어긋나 보인다.
      qc.invalidateQueries({ queryKey: projectKey(projectId) });
      qc.invalidateQueries({ queryKey: projectsKey });
    },
  });
}

export function useCloneProject(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloneProjectDto) =>
      api.post<CloneProjectResult>(`/admin/projects/${sourceId}/clone`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectsKey }),
  });
}
