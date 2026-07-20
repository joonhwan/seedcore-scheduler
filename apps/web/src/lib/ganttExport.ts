// 간트 이미지 내보내기의 순수 계산 로직(부수효과 없음, 테스트 대상).
import type { NodeTreeItem } from '@sam/shared';
import {
  PPD,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  computeActiveRange,
  flattenTree,
  type TimelineUnit,
} from './ganttLayout';
import { dayDiff } from './ganttMath';

// 대화상자에서 고르는 펼침 깊이. 'all' = 모두 펼침, 숫자 K = "K단계까지" 표시.
export type DepthOption = 'all' | number;

export const UNIT_LABELS: Record<TimelineUnit, string> = {
  day: '일',
  week: '주',
  month: '월',
  quarter: '분기',
};

// 한 변이 이 픽셀을 넘으면 canvas 한계 위험으로 경고한다.
export const EXPORT_MAX_EDGE = 16000;
export const EXPORT_PIXEL_RATIO = 2;
export const DEFAULT_LABEL_WIDTH = 280;

// 트리에서 가장 깊은 노드의 depth. 노드가 없으면 -1.
export function treeMaxDepth(items: NodeTreeItem[]): number {
  let max = -1;
  for (const n of items) if (n.depth > max) max = n.depth;
  return max;
}

// 사용자에게 보이는 최대 "단계" 수(= 최대 depth + 1). 노드 없으면 0.
export function depthStepCount(items: NodeTreeItem[]): number {
  return treeMaxDepth(items) + 1;
}

// "K단계까지 펼침" → depth >= K-1 인 GROUP 을 접는다(그 아래가 숨는다).
// 'all' 은 아무것도 접지 않는다.
export function collapsedIdsForDepth(
  items: NodeTreeItem[],
  depth: DepthOption,
): Set<string> {
  if (depth === 'all') return new Set();
  const threshold = depth - 1; // 화면 K단계 = depth K-1
  const ids = new Set<string>();
  for (const n of items) {
    if (n.kind === 'GROUP' && n.depth >= threshold) ids.add(n.id);
  }
  return ids;
}

export interface ExportSize {
  hasContent: boolean;
  unit: TimelineUnit;
  labelWidth: number;
  chartWidth: number;
  totalWidth: number;
  totalHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  rowCount: number;
  exceedsLimit: boolean;
}

export function computeExportSize(params: {
  items: NodeTreeItem[];
  collapsedIds: Set<string>;
  unit: TimelineUnit;
  labelWidth: number;
  pixelRatio: number;
  maxEdge: number;
}): ExportSize {
  const { items, collapsedIds, unit, labelWidth, pixelRatio, maxEdge } = params;
  const range = computeActiveRange(items);
  const rowCount = flattenTree(items, collapsedIds).length;

  if (!range) {
    return {
      hasContent: false,
      unit,
      labelWidth,
      chartWidth: 0,
      totalWidth: 0,
      totalHeight: 0,
      scaledWidth: 0,
      scaledHeight: 0,
      rowCount,
      exceedsLimit: false,
    };
  }

  const totalDays = dayDiff(range.end, range.start) + 1;
  const chartWidth = totalDays * PPD[unit];
  const totalWidth = labelWidth + chartWidth;
  const totalHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT;
  const scaledWidth = Math.round(totalWidth * pixelRatio);
  const scaledHeight = Math.round(totalHeight * pixelRatio);
  const exceedsLimit = Math.max(scaledWidth, scaledHeight) > maxEdge;

  return {
    hasContent: true,
    unit,
    labelWidth,
    chartWidth,
    totalWidth,
    totalHeight,
    scaledWidth,
    scaledHeight,
    rowCount,
    exceedsLimit,
  };
}

// 파일명에 쓸 수 없는 문자를 _ 로 바꾼다.
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

export function buildExportFilename(projectName: string, dateYmd: string): string {
  const trimmed = projectName.trim();
  const base = trimmed ? `${sanitizeFilename(trimmed)}_간트` : '간트';
  return `${base}_${dateYmd}.png`;
}
