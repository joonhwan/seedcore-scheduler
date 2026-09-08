// diff 판정 (백엔드 필터 + 프론트 분류 공용). diff 는 { field: { from, to } } 형태.
export type DiffMap = Record<string, unknown>;

export type ChangeKind =
  | 'PROGRESS_UP'
  | 'PROGRESS_DOWN'
  | 'PROGRESS_DONE'
  | 'PROGRESS_SET'
  | 'PERIOD'
  | 'TITLE'
  | 'CREATE'
  | 'MOVE'
  | 'DELETE'
  | 'RESTORE'
  | 'OTHER';

interface FromTo {
  from: unknown;
  to: unknown;
}

function asField(v: unknown): FromTo | null {
  if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
    return v as FromTo;
  }
  return null;
}

export function getProgressChange(diff: DiffMap): { from: number; to: number } | null {
  const f = asField(diff.progress);
  if (!f) return null;
  if (typeof f.from !== 'number' || typeof f.to !== 'number') return null;
  return { from: f.from, to: f.to };
}

export function isProgressDown(diff: DiffMap): boolean {
  const p = getProgressChange(diff);
  return p !== null && p.to < p.from;
}

export function isPeriodChange(diff: DiffMap): boolean {
  return asField(diff.startAt) !== null || asField(diff.endAt) !== null;
}

export function classifyChange(action: string, diff: DiffMap): ChangeKind {
  switch (action) {
    case 'CREATE':
      return 'CREATE';
    case 'DELETE':
      return 'DELETE';
    case 'RESTORE':
      return 'RESTORE';
    case 'MOVE':
      return 'MOVE';
    case 'UPDATE': {
      // 한 UPDATE 에서 여러 필드가 동시에 바뀌면 우선순위는 progress > period(기간) > title 순.
      const p = getProgressChange(diff);
      if (p) {
        if (p.to === p.from) return 'PROGRESS_SET';
        if (p.to === 100) return 'PROGRESS_DONE';
        return p.to > p.from ? 'PROGRESS_UP' : 'PROGRESS_DOWN';
      }
      if (isPeriodChange(diff)) return 'PERIOD';
      if (asField(diff.title)) return 'TITLE';
      return 'OTHER';
    }
    default:
      return 'OTHER';
  }
}

// ── 프로젝트 이력 집계 (백엔드가 Prisma 결과를 이 형태로 변환해 호출) ──

export const HISTORY_TOPICS = ['ALL', 'PROGRESS_DOWN', 'DELETED', 'PERIOD_CHANGE', 'COMMENTS'] as const;
export type HistoryTopicValue = (typeof HISTORY_TOPICS)[number];

export const HISTORY_RANGES = ['1w', '1m', '3m', '6m', 'custom'] as const;
export type HistoryRangeValue = (typeof HISTORY_RANGES)[number];

export interface RawHistoryRow {
  id: string;
  nodeIdSnapshot: string;
  projectIdSnapshot: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  action: 'CREATE' | 'UPDATE' | 'MOVE' | 'DELETE' | 'RESTORE';
  diff: DiffMap;
  occurredAt: string; // ISO
}

export interface RawCommentRow {
  id: string;
  nodeId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface NodeMeta {
  title: string;
  deleted: boolean;
  /** 루트부터 바로 위 부모까지의 제목. 루트 노드와 삭제된 노드는 빈 배열. */
  parentPath: string[];
}

/** buildParentPaths 가 필요로 하는 최소 노드 정보. */
export interface NodePathRow {
  id: string;
  title: string;
  parentId: string | null;
}

/**
 * 프로젝트의 노드 목록 전체를 받아 노드 id -> 조상 제목 배열(루트가 앞) 맵을 만든다.
 *
 * 이력 화면이 서로 다른 부모 밑의 동명 일정을 구분하기 위해 쓴다. 부모가 목록에 없거나
 * (부분 목록을 넘긴 경우) 부모 관계가 순환하더라도 멈추도록 방문 집합으로 방어한다.
 */
export function buildParentPaths(rows: NodePathRow[]): Map<string, string[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cache = new Map<string, string[]>();

  for (const row of rows) {
    if (cache.has(row.id)) continue;
    const seen = new Set<string>([row.id]);
    const reversed: string[] = []; // 바로 위 부모부터 위로
    let parentId = row.parentId;
    while (parentId && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      seen.add(parentId);
      reversed.push(parent.title);
      parentId = parent.parentId;
    }
    cache.set(row.id, reversed.reverse());
  }
  return cache;
}

export interface HistoryEntryData {
  type: 'HISTORY';
  id: string;
  nodeIdSnapshot: string;
  projectIdSnapshot: string;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  action: 'CREATE' | 'UPDATE' | 'MOVE' | 'DELETE' | 'RESTORE';
  diff: DiffMap;
  occurredAt: string;
  nodeTitle: string;
  nodeDeleted: boolean;
  parentPath: string[];
}

export interface CommentEntryData {
  type: 'COMMENT';
  id: string;
  nodeId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  nodeTitle: string;
  nodeDeleted: boolean;
  parentPath: string[];
}

export type ProjectHistoryEntryData = HistoryEntryData | CommentEntryData;

export interface AggregateResult {
  items: ProjectHistoryEntryData[];
  truncated: boolean;
}

export function selectHistoryByTopic(rows: RawHistoryRow[], topic: HistoryTopicValue): RawHistoryRow[] {
  switch (topic) {
    case 'COMMENTS':
      return [];
    case 'DELETED':
      return rows.filter((r) => r.action === 'DELETE');
    case 'PROGRESS_DOWN':
      return rows.filter((r) => r.action === 'UPDATE' && isProgressDown(r.diff));
    case 'PERIOD_CHANGE':
      return rows.filter((r) => r.action === 'UPDATE' && isPeriodChange(r.diff));
    case 'ALL':
    default:
      return rows;
  }
}

export interface BuildProjectHistoryInput {
  history: RawHistoryRow[];
  comments: RawCommentRow[];
  meta: Map<string, NodeMeta>; // key = nodeIdSnapshot(이력) / nodeId(댓글)
  topic: HistoryTopicValue;
  limit: number;
}

export function buildProjectHistory(input: BuildProjectHistoryInput): AggregateResult {
  const { history, comments, meta, topic, limit } = input;
  const items: ProjectHistoryEntryData[] = [];

  if (topic !== 'COMMENTS') {
    for (const r of selectHistoryByTopic(history, topic)) {
      const m = meta.get(r.nodeIdSnapshot);
      items.push({
        type: 'HISTORY',
        id: r.id,
        nodeIdSnapshot: r.nodeIdSnapshot,
        projectIdSnapshot: r.projectIdSnapshot,
        actorId: r.actorId,
        actorUsername: r.actorUsername,
        actorDisplayName: r.actorDisplayName,
        action: r.action,
        diff: r.diff,
        occurredAt: r.occurredAt,
        nodeTitle: m?.title ?? '(제목 없음)',
        nodeDeleted: m?.deleted ?? true,
        parentPath: m?.parentPath ?? [],
      });
    }
  }

  if (topic === 'ALL' || topic === 'COMMENTS') {
    for (const c of comments) {
      const m = meta.get(c.nodeId);
      items.push({
        type: 'COMMENT',
        id: c.id,
        nodeId: c.nodeId,
        authorId: c.authorId,
        authorUsername: c.authorUsername,
        authorDisplayName: c.authorDisplayName,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        nodeTitle: m?.title ?? '(제목 없음)',
        nodeDeleted: m?.deleted ?? false,
        parentPath: m?.parentPath ?? [],
      });
    }
  }

  // ISO 8601 문자열은 사전식 비교로 시간 순서가 유지된다. 역순(최신 먼저).
  items.sort((a, b) => tsOf(b).localeCompare(tsOf(a)));

  const truncated = items.length > limit;
  return { items: truncated ? items.slice(0, limit) : items, truncated };
}

function tsOf(e: ProjectHistoryEntryData): string {
  return e.type === 'HISTORY' ? e.occurredAt : e.createdAt;
}
