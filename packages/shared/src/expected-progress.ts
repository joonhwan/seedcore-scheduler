/**
 * 예상 진척률 (Expected Progress) 및 일정 지연(Delay Gap) 계산 유틸리티
 */

import { z } from 'zod';

export const DelayStatus = z.enum(['CRITICAL', 'WARNING', 'SLIGHT', 'ON_TRACK', 'UNKNOWN']);
export type DelayStatus = z.infer<typeof DelayStatus>;

export const ProjectDelaySummaryDto = z.object({
  totalNodes: z.number().int(),
  validNodes: z.number().int(),
  criticalCount: z.number().int(),
  warningCount: z.number().int(),
  slightCount: z.number().int(),
  onTrackCount: z.number().int(),
  avgExpectedProgress: z.number().int().nullable(),
  avgActualProgress: z.number().int().nullable(),
  avgDelayGap: z.number().int(),
  status: DelayStatus,
});
export type ProjectDelaySummaryDto = z.infer<typeof ProjectDelaySummaryDto>;

export interface ExpectedProgressResult {
  expectedProgress: number | null; // 0 ~ 100 또는 null (날짜 미지정 시)
  actualProgress: number | null;   // 0 ~ 100 또는 null
  delayGap: number;               // expectedProgress - actualProgress (양수이면 예상보다 지연)
  status: DelayStatus;            // CRITICAL(>=20%p), WARNING(>=10%p), SLIGHT(>0%p), ON_TRACK(<=0%p), UNKNOWN
}

export interface NodeDelayInput {
  id?: string;
  parentId?: string | null;
  kind?: string;
  startAt?: string | null;
  endAt?: string | null;
  startAtEffective?: string | null;
  endAtEffective?: string | null;
  progress?: number | null;
  progressEffective?: number | null;
}

/**
 * 시작일(startAt)과 종료일(endAt), 기준일(todayIso)을 바탕으로 예상 진척률(0~100)을 계산합니다.
 */
export function calculateExpectedProgress(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  todayIso: string = new Date().toISOString().slice(0, 10),
): number | null {
  if (!startAt || !endAt) {
    return null;
  }

  // YYYY-MM-DD 단순 날짜 비교
  if (todayIso < startAt) {
    return 0;
  }
  if (todayIso >= endAt) {
    return 100;
  }

  // startAt <= todayIso < endAt
  const startDate = new Date(`${startAt}T00:00:00Z`);
  const endDate = new Date(`${endAt}T00:00:00Z`);
  const todayDate = new Date(`${todayIso}T00:00:00Z`);

  const totalTime = endDate.getTime() - startDate.getTime();
  if (totalTime <= 0) {
    return todayIso < startAt ? 0 : 100;
  }

  const elapsedTime = todayDate.getTime() - startDate.getTime();
  const progressRatio = elapsedTime / totalTime;
  const progressPercent = Math.round(progressRatio * 100);

  return Math.max(0, Math.min(100, progressPercent));
}

/**
 * 단일 ITEM 노드에 대한 지연 상태를 계산합니다.
 */
export function getItemNodeDelayInfo(
  node: NodeDelayInput,
  todayIso: string = new Date().toISOString().slice(0, 10),
): ExpectedProgressResult {
  // GROUP 노드인 경우 단일 노드 정보만으로는 통째 선형 계산을 수행하지 않음 (자손 전파 전까지 ON_TRACK 기본)
  if (node.kind === 'GROUP') {
    const actualProgress = node.progressEffective ?? node.progress ?? null;
    return {
      expectedProgress: actualProgress,
      actualProgress,
      delayGap: 0,
      status: 'ON_TRACK',
    };
  }

  const startAt = node.startAtEffective ?? node.startAt;
  const endAt = node.endAtEffective ?? node.endAt;
  const actualProgress = node.progressEffective ?? node.progress ?? null;

  const expectedProgress = calculateExpectedProgress(startAt, endAt, todayIso);

  if (expectedProgress === null || actualProgress === null) {
    return {
      expectedProgress,
      actualProgress,
      delayGap: 0,
      status: 'UNKNOWN',
    };
  }

  const delayGap = expectedProgress - actualProgress;

  let status: DelayStatus = 'ON_TRACK';
  if (delayGap >= 20) {
    status = 'CRITICAL';
  } else if (delayGap >= 10) {
    status = 'WARNING';
  } else if (delayGap > 0) {
    status = 'SLIGHT';
  }

  return {
    expectedProgress,
    actualProgress,
    delayGap,
    status,
  };
}

/**
 * 전체 노드 배열에서 특정 GROUP 노드의 모든 자손 ITEM 노드들을 수집합니다.
 */
function collectSubtreeItemNodes<T extends NodeDelayInput>(
  groupId: string,
  allNodes: T[],
): T[] {
  const items: T[] = [];
  const queue = [groupId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = allNodes.filter((n) => n.parentId === currentId);
    for (const child of children) {
      if (child.kind === 'ITEM' || (!child.kind && child.startAt && child.endAt)) {
        items.push(child);
      } else if (child.id) {
        queue.push(child.id);
      }
    }
  }

  return items;
}

/**
 * 트리 구조 노드 배열 전체의 지연 정보 Map을 생성합니다.
 * ITEM 노드는 선형 예상진척도 및 delayGap으로 지연 상태를 판단하고,
 * GROUP 노드는 자손 ITEM 노드들의 지연 상태를 버블업(전파)받아 결정합니다.
 */
export function calculateTreeNodesDelayInfo<T extends NodeDelayInput>(
  allNodes: T[],
  todayIso: string = new Date().toISOString().slice(0, 10),
): Map<string, ExpectedProgressResult> {
  const resultMap = new Map<string, ExpectedProgressResult>();

  // 1) ITEM 노드들 지연 상태 먼저 계산
  const itemMap = new Map<string, ExpectedProgressResult>();
  for (const node of allNodes) {
    if (node.kind === 'ITEM' || (!node.kind && (node.startAt || node.endAt))) {
      const info = getItemNodeDelayInfo(node, todayIso);
      if (node.id) {
        itemMap.set(node.id, info);
        resultMap.set(node.id, info);
      }
    }
  }

  // 2) GROUP 노드들 버블업(전파) 지연 상태 계산
  for (const node of allNodes) {
    if (node.kind === 'GROUP' && node.id) {
      const childItems = collectSubtreeItemNodes(node.id, allNodes);
      if (childItems.length === 0) {
        resultMap.set(node.id, {
          expectedProgress: null,
          actualProgress: node.progressEffective ?? null,
          delayGap: 0,
          status: 'UNKNOWN',
        });
        continue;
      }

      // 자손 ITEM 노드들의 ExpectedProgress 평균 및 지연 상태 확인
      let sumExpected = 0;
      let validExpectedCount = 0;
      let hasCritical = false;
      let hasWarning = false;
      let hasSlight = false;

      for (const item of childItems) {
        const itemInfo = itemMap.get(item.id || '') || getItemNodeDelayInfo(item, todayIso);
        if (itemInfo.expectedProgress !== null) {
          sumExpected += itemInfo.expectedProgress;
          validExpectedCount++;
        }

        if (itemInfo.status === 'CRITICAL') hasCritical = true;
        else if (itemInfo.status === 'WARNING') hasWarning = true;
        else if (itemInfo.status === 'SLIGHT') hasSlight = true;
      }

      const avgExpected = validExpectedCount > 0 ? Math.round(sumExpected / validExpectedCount) : null;
      const actualProgress = node.progressEffective ?? (validExpectedCount > 0 ? Math.round(childItems.reduce((acc, cur) => acc + (cur.progress ?? 0), 0) / childItems.length) : null);
      const delayGap = (avgExpected !== null && actualProgress !== null) ? (avgExpected - actualProgress) : 0;

      // 지연 상태 버블업(Bubble-up):
      // 자손 중 심각이 1개라도 있으면 심각, 주의만 있으면 주의, 소폭이 있으면 소폭, 그 외는 정상
      let status: DelayStatus = 'ON_TRACK';
      if (hasCritical) {
        status = 'CRITICAL';
      } else if (hasWarning) {
        status = 'WARNING';
      } else if (hasSlight) {
        status = 'SLIGHT';
      }

      resultMap.set(node.id, {
        expectedProgress: avgExpected,
        actualProgress,
        delayGap,
        status,
      });
    }
  }

  return resultMap;
}

/**
 * 단일 노드 또는 노드 트리의 지연 정보를 반환합니다.
 * allNodes가 주어지면 GROUP 노드의 서브트리 전파 상태를 정확하게 반환합니다.
 */
export function getNodeDelayInfo<T extends NodeDelayInput>(
  node: T,
  todayIso: string = new Date().toISOString().slice(0, 10),
  allNodes?: T[],
): ExpectedProgressResult {
  if (allNodes && allNodes.length > 0 && node.id) {
    const map = calculateTreeNodesDelayInfo(allNodes, todayIso);
    const info = map.get(node.id);
    if (info) return info;
  }

  return getItemNodeDelayInfo(node, todayIso);
}

export interface ProjectDelaySummary {
  totalNodes: number;
  validNodes: number;            // 계산 가능한 ITEM 노드 수
  criticalCount: number;         // CRITICAL 지연 ITEM 노드 수
  warningCount: number;          // WARNING 지연 ITEM 노드 수
  slightCount: number;           // SLIGHT 지연 ITEM 노드 수
  onTrackCount: number;          // 정상 진행 ITEM 노드 수
  avgExpectedProgress: number | null; // ITEM 노드 평균 예상 진척률
  avgActualProgress: number | null;   // ITEM 노드 평균 실제 진척률
  avgDelayGap: number;           // avgExpectedProgress - avgActualProgress
  status: DelayStatus;           // 프로젝트 전체 종합 지연 상태
}

/**
 * 프로젝트 내 전체 노드 목록을 바탕으로 지연 현황 요약을 계산합니다.
 */
export function calculateProjectDelaySummary<T extends NodeDelayInput>(
  nodes: T[],
  todayIso: string = new Date().toISOString().slice(0, 10),
): ProjectDelaySummary {
  const itemNodes = nodes.filter((n) => n.kind === 'ITEM' || (!n.kind && n.startAt && n.endAt));
  const targetNodes = itemNodes.length > 0 ? itemNodes : nodes;

  let criticalCount = 0;
  let warningCount = 0;
  let slightCount = 0;
  let onTrackCount = 0;

  let totalExpected = 0;
  let totalActual = 0;
  let validNodes = 0;

  for (const node of targetNodes) {
    const info = getItemNodeDelayInfo(node, todayIso);
    if (info.status === 'UNKNOWN' || info.expectedProgress === null || info.actualProgress === null) {
      continue;
    }

    validNodes++;
    totalExpected += info.expectedProgress;
    totalActual += info.actualProgress;

    if (info.status === 'CRITICAL') criticalCount++;
    else if (info.status === 'WARNING') warningCount++;
    else if (info.status === 'SLIGHT') slightCount++;
    else if (info.status === 'ON_TRACK') onTrackCount++;
  }

  if (validNodes === 0) {
    return {
      totalNodes: nodes.length,
      validNodes: 0,
      criticalCount: 0,
      warningCount: 0,
      slightCount: 0,
      onTrackCount: 0,
      avgExpectedProgress: null,
      avgActualProgress: null,
      avgDelayGap: 0,
      status: 'UNKNOWN',
    };
  }

  const avgExpectedProgress = Math.round(totalExpected / validNodes);
  const avgActualProgress = Math.round(totalActual / validNodes);
  const avgDelayGap = avgExpectedProgress - avgActualProgress;

  let status: DelayStatus = 'ON_TRACK';
  if (criticalCount > 0) {
    status = 'CRITICAL';
  } else if (warningCount > 0) {
    status = 'WARNING';
  } else if (slightCount > 0) {
    status = 'SLIGHT';
  }

  return {
    totalNodes: nodes.length,
    validNodes,
    criticalCount,
    warningCount,
    slightCount,
    onTrackCount,
    avgExpectedProgress,
    avgActualProgress,
    avgDelayGap,
    status,
  };
}
