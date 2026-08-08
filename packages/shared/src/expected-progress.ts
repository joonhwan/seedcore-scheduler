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

export const DELAY_THRESHOLDS = {
  CRITICAL: 30, // 30% 이상 지연 시 심각 지연
  WARNING: 15,  // 15% 이상 지연 시 주의 지연
  SLIGHT: 0,    // 0% 초과 지연 시 소폭 지연
} as const;

export const DELAY_THRESHOLD_CRITICAL = DELAY_THRESHOLDS.CRITICAL;
export const DELAY_THRESHOLD_WARNING = DELAY_THRESHOLDS.WARNING;
export const DELAY_THRESHOLD_SLIGHT = DELAY_THRESHOLDS.SLIGHT;

export function getDelayStatusTooltip(status: DelayStatus, delayGap?: number): string {
  const gapText = delayGap !== undefined && delayGap > 0 ? ` (${delayGap}% 지연)` : '';

  switch (status) {
    case 'CRITICAL':
      if (delayGap !== undefined && delayGap < DELAY_THRESHOLDS.CRITICAL) {
        return `마감일 경과 항목이 존재합니다.${gapText}`;
      }
      return `예상보다 ${DELAY_THRESHOLDS.CRITICAL}% 이상 심각하게 지연 중입니다.${gapText}`;

    case 'WARNING':
      if (delayGap !== undefined && delayGap < DELAY_THRESHOLDS.WARNING) {
        return `예상보다 지연 중입니다.${gapText}`;
      }
      return `예상보다 ${DELAY_THRESHOLDS.WARNING}% 이상 지연 중입니다.${gapText}`;

    case 'SLIGHT':
      return `예상보다 소폭 지연 중입니다.${gapText}`;

    case 'ON_TRACK':
    default:
      return '예상 일정대로 정상 진행 중입니다.';
  }
}

export interface ExpectedProgressResult {
  expectedProgress: number | null; // 0 ~ 100 또는 null (날짜 미지정 시)
  actualProgress: number | null;   // 0 ~ 100 또는 null
  delayGap: number;               // expectedProgress - actualProgress (양수이면 예상보다 지연)
  status: DelayStatus;            // CRITICAL(>=30%), WARNING(>=15%), SLIGHT(>0%), ON_TRACK(<=0%), UNKNOWN
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
 * 오늘 날짜의 YYYY-MM-DD ISO 문자열을 구합니다. (기본값: 로컬 타임존 기준)
 */
export function getTodayIso(todayIso?: string): string {
  if (todayIso) return todayIso;
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * fromIso(포함)부터 toIso(미포함) 사이의 날짜 중 주말(토요일, 일요일)을 제외한 영업일(Working Days) 수 반환.
 */
export function countWorkingDays(fromIso: string, toIso: string): number {
  if (fromIso >= toIso) return 0;

  let current = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  let count = 0;

  while (current < end) {
    const dayOfWeek = current.getUTCDay(); // 0: 일요일, 6: 토요일
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * 시작일(startAt)과 종료일(endAt), 기준일(todayIso)을 바탕으로 주말(토/일)을 제외한
 * 영업일 기준 예상 진척률(0~100)을 계산합니다.
 */
export function calculateExpectedProgress(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  todayIso: string = getTodayIso(),
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
  const totalWorkingDays = countWorkingDays(startAt, endAt);
  const elapsedWorkingDays = countWorkingDays(startAt, todayIso);

  // 만약 주말 단기 작업 등으로 전체 기간 내 영업일이 0일인 경우, 달력일수(Calendar Days) 방식으로 fallback
  if (totalWorkingDays <= 0) {
    const startDate = new Date(`${startAt}T00:00:00Z`);
    const endDate = new Date(`${endAt}T00:00:00Z`);
    const todayDate = new Date(`${todayIso}T00:00:00Z`);
    const totalTime = endDate.getTime() - startDate.getTime();
    if (totalTime <= 0) return todayIso < startAt ? 0 : 100;

    const elapsedTime = todayDate.getTime() - startDate.getTime();
    return Math.max(0, Math.min(100, Math.round((elapsedTime / totalTime) * 100)));
  }

  const progressPercent = Math.round((elapsedWorkingDays / totalWorkingDays) * 100);
  return Math.max(0, Math.min(100, progressPercent));
}

/**
 * 단일 ITEM 노드에 대한 지연 상태를 계산합니다.
 */
export function getItemNodeDelayInfo(
  node: NodeDelayInput,
  todayIso: string = getTodayIso(),
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

  // 단기 일정(Short-Term Task: 영업일 기준 1~3일) 판별
  // 주말 전용 작업 등으로 영업일 수가 0일인 경우, 달력일수(Calendar Days) 기준 3일 이하 판별
  let isShortTerm = false;
  if (startAt && endAt) {
    const workingDays = countWorkingDays(startAt, endAt);
    if (workingDays > 0) {
      isShortTerm = workingDays <= 3;
    } else {
      const sDate = new Date(`${startAt}T00:00:00Z`);
      const eDate = new Date(`${endAt}T00:00:00Z`);
      const calDays = Math.ceil((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24));
      isShortTerm = calDays <= 3;
    }
  }

  let status: DelayStatus = 'ON_TRACK';

  if (isShortTerm) {
    // 단기 일정(영업일 1~3일) 지연 상태 특수 정책:
    // 1) actualProgress === 100 -> ON_TRACK
    // 2) 오늘 < endAt -> ON_TRACK (진행 중일 때는 억울한 조기 지연 경고 방지)
    // 3) 오늘 === endAt -> WARNING (오늘이 마감일인데 미완료)
    // 4) 오늘 > endAt -> CRITICAL (마감일 지남 & 미완료)
    if (actualProgress >= 100) {
      status = 'ON_TRACK';
    } else if (endAt && todayIso === endAt) {
      status = 'WARNING';
    } else if (endAt && todayIso > endAt) {
      status = 'CRITICAL';
    } else {
      status = 'ON_TRACK';
    }
  } else {
    // 일반 일정 (영업일 4일 이상) 기존 정책:
    const isOverdue = !!endAt && todayIso > endAt && actualProgress < 100;
    if (isOverdue || delayGap >= 30) {
      status = 'CRITICAL';
    } else if (delayGap >= 15) {
      status = 'WARNING';
    } else if (delayGap > 0) {
      status = 'SLIGHT';
    }
  }

  return {
    expectedProgress,
    actualProgress,
    delayGap,
    status,
  };
}

// ─── 집계 규칙 (GROUP 버블업 · 프로젝트 요약 공용) ─────────────────────────
//
// 여러 ITEM 의 지연 정보를 하나로 합치는 규칙은 **여기 한 곳에만** 둔다.
// 예전에는 GROUP 버블업(calculateTreeNodesDelayInfo)과 프로젝트 요약
// (calculateProjectDelaySummary)이 각자 평균을 내다가 실제로 어긋났다:
// 버블업은 예상 진척률을 "날짜가 있는 ITEM" 으로 평균 내면서 실제 진척률은
// progressEffective(=날짜 유무와 무관한 전체 ITEM 평균)를 썼다. 분모가 달라서
// 날짜 미기입 항목이 하나만 있어도 실제 진척률이 끌어내려지고 지연이 부풀려졌다.
// (예: 20% 인 항목 하나 + 날짜 없는 항목 하나 → 예상 25% / 실제 10% → gap 15,
//  같은 상황에서 프로젝트 요약은 gap 5 를 냈다.)
//
// 규칙: **판단 가능한 ITEM 만 세고, 예상과 실제를 그 같은 집합으로 평균 낸다.**
// 날짜가 없어 판단할 수 없는 항목은 분자에도 분모에도 넣지 않는다 — 모르는 것을
// 0% 로 치면 없는 지연을 만들어낸다.

interface DelayAccumulator {
  sumExpected: number;
  sumActual: number;
  validCount: number;
  criticalCount: number;
  warningCount: number;
  slightCount: number;
  onTrackCount: number;
}

function emptyAccumulator(): DelayAccumulator {
  return {
    sumExpected: 0,
    sumActual: 0,
    validCount: 0,
    criticalCount: 0,
    warningCount: 0,
    slightCount: 0,
    onTrackCount: 0,
  };
}

/** ITEM 하나의 판정 결과를 누적기에 더한다. 판단 불가(UNKNOWN)면 아무것도 세지 않는다. */
function addToAccumulator(acc: DelayAccumulator, info: ExpectedProgressResult): void {
  if (
    info.status === 'UNKNOWN' ||
    info.expectedProgress === null ||
    info.actualProgress === null
  ) {
    return;
  }
  acc.validCount += 1;
  acc.sumExpected += info.expectedProgress;
  acc.sumActual += info.actualProgress;
  if (info.status === 'CRITICAL') acc.criticalCount += 1;
  else if (info.status === 'WARNING') acc.warningCount += 1;
  else if (info.status === 'SLIGHT') acc.slightCount += 1;
  else if (info.status === 'ON_TRACK') acc.onTrackCount += 1;
}

/** 하위 누적기를 상위로 합친다. 평균의 평균이 되지 않도록 합계·개수를 그대로 올린다. */
function mergeAccumulator(target: DelayAccumulator, source: DelayAccumulator): void {
  target.sumExpected += source.sumExpected;
  target.sumActual += source.sumActual;
  target.validCount += source.validCount;
  target.criticalCount += source.criticalCount;
  target.warningCount += source.warningCount;
  target.slightCount += source.slightCount;
  target.onTrackCount += source.onTrackCount;
}

/** 누적기를 최종 지연 정보로 환산한다. 판단 가능한 항목이 하나도 없으면 UNKNOWN. */
function finishAccumulator(acc: DelayAccumulator): ExpectedProgressResult {
  if (acc.validCount === 0) {
    return {
      expectedProgress: null,
      actualProgress: null,
      delayGap: 0,
      status: 'UNKNOWN',
    };
  }
  const expectedProgress = Math.round(acc.sumExpected / acc.validCount);
  const actualProgress = Math.round(acc.sumActual / acc.validCount);
  // 자손 중 최악을 위로 올린다. 하나라도 심각하면 그 그룹은 심각이다.
  let status: DelayStatus = 'ON_TRACK';
  if (acc.criticalCount > 0) status = 'CRITICAL';
  else if (acc.warningCount > 0) status = 'WARNING';
  else if (acc.slightCount > 0) status = 'SLIGHT';
  return {
    expectedProgress,
    actualProgress,
    delayGap: expectedProgress - actualProgress,
    status,
  };
}

/**
 * 트리 구조 노드 배열 전체의 지연 정보 Map을 생성합니다.
 * ITEM 노드는 선형 예상진척도 및 delayGap으로 지연 상태를 판단하고,
 * GROUP 노드는 자손 ITEM 노드들의 지연 상태를 버블업(전파)받아 결정합니다.
 */
export function calculateTreeNodesDelayInfo<T extends NodeDelayInput>(
  allNodes: T[],
  todayIso: string = getTodayIso(),
): Map<string, ExpectedProgressResult> {
  const resultMap = new Map<string, ExpectedProgressResult>();

  // 부모 → 자식 인덱스. 이게 있어야 아래 순회가 한 번으로 끝난다.
  const childrenByParentMap = new Map<string, T[]>();
  for (const node of allNodes) {
    if (!node.parentId) continue;
    let list = childrenByParentMap.get(node.parentId);
    if (!list) {
      list = [];
      childrenByParentMap.set(node.parentId, list);
    }
    list.push(node);
  }

  // 후위 순회(post-order)로 한 번에 올린다.
  //
  // 예전에는 GROUP 마다 collectSubtreeItemNodes() 로 자기 서브트리를 통째로 다시 훑어서,
  // 깊은 트리에서 같은 노드를 깊이만큼 반복해 읽었다(최악 O(N²)). 자식의 누적기를 부모로
  // 합쳐 올리면 노드당 정확히 한 번만 본다. 합계·개수를 올리는 방식이라 "평균의 평균" 도
  // 생기지 않는다 — 손자 항목이 자식 그룹 수에 따라 가중되는 일이 없다.
  const visiting = new Set<string>();

  function visit(node: T): DelayAccumulator {
    const acc = emptyAccumulator();

    // ITEM 은 자기 판정이 곧 누적값이다.
    if (node.kind === 'ITEM' || (!node.kind && (node.startAt || node.endAt))) {
      const info = getItemNodeDelayInfo(node, todayIso);
      if (node.id) resultMap.set(node.id, info);
      addToAccumulator(acc, info);
      return acc;
    }

    // GROUP: 자손을 합쳐 올린다.
    if (node.id) {
      // DB 제약상 순환은 생기지 않지만(move 가 사이클을 거부한다), 여기서 무한 재귀에
      // 빠지면 화면 전체가 멈추므로 방어한다.
      if (visiting.has(node.id)) return acc;
      visiting.add(node.id);
    }
    for (const child of childrenByParentMap.get(node.id ?? '') ?? []) {
      mergeAccumulator(acc, visit(child));
    }
    if (node.id) {
      visiting.delete(node.id);
      resultMap.set(node.id, finishAccumulator(acc));
    }
    return acc;
  }

  // 루트(부모 없음)부터 훑는다.
  for (const node of allNodes) {
    if (!node.parentId) visit(node);
  }
  // 부모가 목록에 없는 노드(부분 트리를 넘겨받은 경우 등)는 위 순회에서 빠진다.
  // 화면에서 배지가 통째로 사라지는 것보다는 홀로 계산해서라도 채우는 편이 낫다.
  for (const node of allNodes) {
    if (node.id && !resultMap.has(node.id)) visit(node);
  }

  return resultMap;
}

/**
 * 단일 노드 또는 노드 트리의 지연 정보를 반환합니다.
 * allNodes 또는 precomputedMap이 주어지면 GROUP 노드의 서브트리 전파 상태를 정확하고 빠르게 반환합니다.
 */
export function getNodeDelayInfo<T extends NodeDelayInput>(
  node: T,
  todayIso: string = getTodayIso(),
  allNodesOrMap?: T[] | Map<string, ExpectedProgressResult>,
): ExpectedProgressResult {
  if (allNodesOrMap && node.id) {
    if (allNodesOrMap instanceof Map) {
      const info = allNodesOrMap.get(node.id);
      if (info) return info;
    } else if (Array.isArray(allNodesOrMap) && allNodesOrMap.length > 0) {
      const map = calculateTreeNodesDelayInfo(allNodesOrMap, todayIso);
      const info = map.get(node.id);
      if (info) return info;
    }
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
  // getTodayIso() 를 쓴다. 예전에는 여기만 new Date().toISOString().slice(0,10) 으로 **UTC**
  // 날짜를 썼는데, 같은 파일의 getItemNodeDelayInfo() 등은 getTodayIso() 로 **로컬** 날짜를
  // 쓴다. KST(UTC+9)에서는 00:00~08:59 동안 두 값이 하루 어긋나므로, 그 시간대에 프로젝트
  // 헤더의 종합 배지와 트리 각 행의 배지가 서로 다른 기준일로 계산돼 결과가 엇갈렸다.
  // "오늘" 의 정의는 이 파일 전체에서 getTodayIso() 하나여야 한다.
  todayIso: string = getTodayIso(),
): ProjectDelaySummary {
  const itemNodes = nodes.filter((n) => n.kind === 'ITEM' || (!n.kind && n.startAt && n.endAt));
  // ITEM 이 하나도 없으면(폴더만 만들어 둔 상태) 넘어온 노드를 그대로 대상으로 둔다.
  // GROUP 은 getItemNodeDelayInfo() 에서 ON_TRACK 으로 판정되므로 결과적으로 "정상" 이 된다.
  // 일정이 없는데 정상이라 부르는 게 옳으냐는 별개 논의라, 여기서는 기존 동작을 유지한다.
  const targetNodes = itemNodes.length > 0 ? itemNodes : nodes;

  // 집계 규칙은 GROUP 버블업과 공유한다 — 둘이 따로 평균을 내다가 실제로 어긋난 적이 있다
  // (DelayAccumulator 위 주석 참고). 정책이 바뀌면 이제 한 곳만 고치면 된다.
  const acc = emptyAccumulator();
  for (const node of targetNodes) {
    addToAccumulator(acc, getItemNodeDelayInfo(node, todayIso));
  }
  const aggregate = finishAccumulator(acc);

  return {
    totalNodes: nodes.length,
    validNodes: acc.validCount,
    criticalCount: acc.criticalCount,
    warningCount: acc.warningCount,
    slightCount: acc.slightCount,
    onTrackCount: acc.onTrackCount,
    avgExpectedProgress: aggregate.expectedProgress,
    avgActualProgress: aggregate.actualProgress,
    avgDelayGap: aggregate.delayGap,
    status: aggregate.status,
  };
}
