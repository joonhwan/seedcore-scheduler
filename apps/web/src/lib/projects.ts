import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
      api.post<any>(`/projects/${projectId}/import-csv`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', projectId, 'nodes'] });
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
