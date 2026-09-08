import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateNodeDto,
  MoveNodeDto,
  NodeTreeItem,
  UpdateNodeDto,
} from '@sam/shared';
import { api } from './api';
import { projectKey, projectsKey } from './projects';
import { dropProjectHistoryCache } from './projectHistory';

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
  // 프로젝트 목록도 함께 무효화한다. 일정 하나를 고치면 목록의 "수정일"과 기본 정렬
  // 순서가 달라지기 때문이다(ProjectListItem.lastScheduleChangeAt).
  //
  // 위의 projectKey(= ['projects', id])로는 목록이 걸리지 않는다. 무효화는 주어진 키로
  // 시작하는 쿼리를 찾는데, 목록 키는 ['projects'] 로 그보다 짧다. 이 한 줄이 없으면
  // 이미 받아둔 목록이 캐시에 그대로 남아, 일정을 고쳐도 옛 수정일이 계속 보인다
  // (창 포커스로는 다시 받지 않는다 — main.tsx 의 refetchOnWindowFocus: false).
  qc.invalidateQueries({ queryKey: projectsKey });

  // 이력 화면은 무효화가 아니라 캐시 제거다. 위의 projectKey 무효화로도 접두가 걸리기는
  // 하지만, 무효화는 "다음에 볼 때 다시 받아라"일 뿐이라 옛 목록이 먼저 그려진다.
  // 방금 고친 일정이 빠진 목록을 보게 되므로 아예 지운다(dropProjectHistoryCache 주석 참고).
  dropProjectHistoryCache(qc, projectId);
}

export function useCreateNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['nodes', projectId, 'create'],
    mutationFn: (input: CreateNodeDto) =>
      api.post<NodeTreeItem>(`/projects/${projectId}/nodes`, input),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useUpdateNode(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['nodes', projectId, 'update'],
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
    mutationKey: ['nodes', projectId, 'move'],
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
    mutationKey: ['nodes', projectId, 'delete'],
    mutationFn: (id: string) => api.delete<void>(`/nodes/${id}`),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}
