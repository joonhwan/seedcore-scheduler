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
  // 날짜 간격 계산 (UTC 기준 일수 계산으로 타임존 왜곡 방지)
  const startDate = new Date(`${startAt}T00:00:00Z`);
  const endDate = new Date(`${endAt}T00:00:00Z`);
  const todayDate = new Date(`${todayIso}T00:00:00Z`);

  const totalTime = endDate.getTime() - startDate.getTime();
  if (totalTime <= 0) {
    // startAt === endAt 또는 startAt > endAt
    return todayIso < startAt ? 0 : 100;
  }

  const elapsedTime = todayDate.getTime() - startDate.getTime();
  const progressRatio = elapsedTime / totalTime;
  const progressPercent = Math.round(progressRatio * 100);

  return Math.max(0, Math.min(100, progressPercent));
}

/**
 * 노드의 날짜와 진척률 정보를 받아 지연 상태 및 예상 진척률을 도출합니다.
 */
export function getNodeDelayInfo(
  node: {
    startAt?: string | null;
    endAt?: string | null;
    startAtEffective?: string | null;
    endAtEffective?: string | null;
    progress?: number | null;
    progressEffective?: number | null;
  },
  todayIso: string = new Date().toISOString().slice(0, 10),
): ExpectedProgressResult {
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
 * 프로젝트 내 노드 목록을 바탕으로 전체 프로젝트의 지연 현황 요약을 계산합니다.
 */
export interface ProjectDelaySummary {
  totalNodes: number;
  validNodes: number;            // 예상 진척률 계산이 가능한 노드 수
  criticalCount: number;         // CRITICAL 지연 노드 수
  warningCount: number;          // WARNING 지연 노드 수
  slightCount: number;           // SLIGHT 지연 노드 수
  onTrackCount: number;          // 정상 진행 노드 수
  avgExpectedProgress: number | null; // 노드 평균 예상 진척률
  avgActualProgress: number | null;   // 노드 평균 실제 진척률
  avgDelayGap: number;           // avgExpectedProgress - avgActualProgress
  status: DelayStatus;           // 프로젝트 전체 종합 지연 상태
}

export function calculateProjectDelaySummary(
  nodes: Array<{
    kind?: string;
    startAt?: string | null;
    endAt?: string | null;
    startAtEffective?: string | null;
    endAtEffective?: string | null;
    progress?: number | null;
    progressEffective?: number | null;
  }>,
  todayIso: string = new Date().toISOString().slice(0, 10),
): ProjectDelaySummary {
  let criticalCount = 0;
  let warningCount = 0;
  let slightCount = 0;
  let onTrackCount = 0;

  let totalExpected = 0;
  let totalActual = 0;
  let validNodes = 0;

  for (const node of nodes) {
    const info = getNodeDelayInfo(node, todayIso);
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
  if (criticalCount > 0 || avgDelayGap >= 15) {
    status = 'CRITICAL';
  } else if (warningCount > 0 || avgDelayGap >= 5) {
    status = 'WARNING';
  } else if (slightCount > 0 || avgDelayGap > 0) {
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
