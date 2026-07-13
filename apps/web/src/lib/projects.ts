import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
      qc.invalidateQueries({ queryKey: projectsKey });
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
