// 프로젝트 복제 시 일정 트리를 재구성하는 순수 함수.
//
// Prisma 를 쓰지 않아 단위 테스트가 가능하다. schedule_nodes.parent_id 가 자기참조라서
// 새 UUID 를 부여하면서 oldId → newId 맵으로 부모 포인터를 다시 엮어야 하는데,
// 이 연결이 한 군데만 틀어져도 5,000 노드 트리가 조용히 망가진다.

import { remapDatePair, type DatePair, type RemapPlan } from '@sam/shared';

/** 원본 프로젝트에서 읽어 온 노드. schedule_nodes 에서 복제에 필요한 컬럼만. */
export interface SourceNode {
  id: string;
  parentId: string | null;
  kind: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  depth: number;
}

/** 새 프로젝트에 삽입할 노드. sourceNodeId 는 DB 컬럼이 아니라 NodeHistory 기록용이다. */
export interface ClonedNode {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  progress: number;
  sortOrder: number;
  depth: number;
  createdById: string;
  updatedById: string;
  sourceNodeId: string;
}

/**
 * 원본 노드들을 새 프로젝트용 노드로 재구성한다.
 *  - 각 노드에 새 ID 를 부여하고 oldId → newId 맵으로 parentId 를 다시 엮는다
 *  - ITEM 의 날짜만 plan 대로 사상한다. GROUP 은 DB 에 날짜가 비어 있고 자손 ITEM 에서
 *    자동 계산되므로(AGENTS.md §4.6) 손대지 않는다
 *  - progress 는 전부 0 으로 초기화한다 (새 호기는 아직 시작하지 않은 일정이다)
 *  - depth 오름차순으로 정렬해 반환한다. 호출자가 이 순서대로 넣으면 부모가 항상 먼저 존재한다
 *
 * newId 를 주입받는 이유는 테스트에서 randomUUID 대신 결정적 ID 를 넣어
 * 부모 포인터가 정확히 어디로 엮였는지 단정할 수 있게 하기 위함이다.
 */
export function buildClonedNodes(args: {
  sourceNodes: SourceNode[];
  newProjectId: string;
  actorId: string;
  plan: RemapPlan;
  newId: () => string;
}): ClonedNode[] {
  const { sourceNodes, newProjectId, actorId, plan, newId } = args;

  const ordered = [...sourceNodes].sort(
    (a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder,
  );

  const idMap = new Map<string, string>();
  for (const node of ordered) idMap.set(node.id, newId());

  return ordered.map((node) => {
    const dates: DatePair =
      node.kind === 'ITEM'
        ? remapDatePair({ startAt: node.startAt, endAt: node.endAt }, plan)
        : { startAt: node.startAt, endAt: node.endAt };

    // 부모 ID 가 입력 배열에 없으면 즉시 실패한다. 조용히 null 로 만들면
    // parentId: null, depth: 3 같은 모순된 행이 생겨 트리가 조용히 망가진다.
    let parentId: string | null = null;
    if (node.parentId !== null) {
      const newParentId = idMap.get(node.parentId);
      if (newParentId === undefined) {
        throw new Error(
          `Source node "${node.id}" (depth ${node.depth}) refers to missing parent "${node.parentId}".`,
        );
      }
      parentId = newParentId;
    }

    return {
      id: idMap.get(node.id)!,
      projectId: newProjectId,
      parentId,
      kind: node.kind,
      title: node.title,
      description: node.description,
      startAt: dates.startAt,
      endAt: dates.endAt,
      progress: 0,
      sortOrder: node.sortOrder,
      depth: node.depth,
      createdById: actorId,
      updatedById: actorId,
      sourceNodeId: node.id,
    };
  });
}
