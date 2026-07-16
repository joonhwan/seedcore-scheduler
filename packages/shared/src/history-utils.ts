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
