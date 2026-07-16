import type { NodeTreeItem } from '@sam/shared';

// effective 범위가 드래그로 인해 바뀐 GROUP 하나의 변경 내역.
export interface AffectedGroupChange {
  id: string;
  title: string;
  depth: number;
  beforeStart: string | null;
  beforeEnd: string | null;
  afterStart: string | null;
  afterEnd: string | null;
}

// 막대 드래그로 확정 대기 중인 변경 제안. Timeline -> ProjectDetailPage -> 확인 모달로 전달된다.
export interface BarChangeProposal {
  node: NodeTreeItem; // 드래그 대상 ITEM
  newStartAt: string; // "YYYY-MM-DD"
  newEndAt: string;
  affectedGroups: AffectedGroupChange[];
}
