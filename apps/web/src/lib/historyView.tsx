import { classifyChange, getProgressChange, type ChangeKind } from '@sam/shared';

export interface KindStyle {
  icon: string;
  strip: string; // 왼쪽 색 띠 (배경)
  text: string; // 아이콘·숫자 글자색
}

// 변경 종류별 아이콘/색 (스펙 §7 표). COMMENT 는 페이지에서 별도 처리.
export const KIND_STYLE: Record<ChangeKind, KindStyle> = {
  PROGRESS_UP: { icon: '↗', strip: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  PROGRESS_DOWN: { icon: '↘', strip: 'bg-rose-400', text: 'text-rose-600 dark:text-rose-400' },
  PROGRESS_DONE: { icon: '✓', strip: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  PROGRESS_SET: { icon: '→', strip: 'bg-sky-400', text: 'text-sky-600 dark:text-sky-400' },
  PERIOD: { icon: '📅', strip: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  TITLE: { icon: '✏', strip: 'bg-slate-300', text: 'text-slate-600 dark:text-slate-300' },
  CREATE: { icon: '＋', strip: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400' },
  MOVE: { icon: '↳', strip: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  DELETE: { icon: '🗑', strip: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  RESTORE: { icon: '↺', strip: 'bg-violet-400', text: 'text-violet-600 dark:text-violet-400' },
  OTHER: { icon: '•', strip: 'bg-slate-300', text: 'text-slate-600 dark:text-slate-300' },
};

/** 짧은 라벨 문자열 (예: "진행률 80% → 50%"). 순수 함수 — 테스트 대상. */
export function historyLabelText(action: string, diff: Record<string, unknown>): string {
  const kind = classifyChange(action, diff);
  switch (kind) {
    case 'PROGRESS_UP':
    case 'PROGRESS_DOWN':
    case 'PROGRESS_SET': {
      const p = getProgressChange(diff);
      return p ? `진행률 ${p.from}% → ${p.to}%` : '진행률 변경';
    }
    case 'PROGRESS_DONE': {
      const p = getProgressChange(diff);
      return p ? `진행률 ${p.to}%` : '진행률 완료';
    }
    case 'PERIOD':
      return `기간 ${periodText(diff)}`;
    case 'TITLE':
      return `제목 ${pairText(diff, 'title', true)}`;
    case 'CREATE':
      return '생성';
    case 'MOVE':
      return '위치 이동';
    case 'DELETE':
      return '삭제';
    case 'RESTORE':
      return '복구';
    default:
      return '수정';
  }
}

function field(diff: Record<string, unknown>, key: string): { from: unknown; to: unknown } | null {
  const v = diff[key];
  if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
    return v as { from: unknown; to: unknown };
  }
  return null;
}

function short(v: unknown): string {
  return v === null || v === undefined || v === '' ? '없음' : String(v);
}

function pairText(diff: Record<string, unknown>, key: string, quote = false): string {
  const f = field(diff, key);
  if (!f) return '변경';
  const from = quote ? `"${short(f.from)}"` : short(f.from);
  const to = quote ? `"${short(f.to)}"` : short(f.to);
  return `${from} → ${to}`;
}

function periodText(diff: Record<string, unknown>): string {
  if (field(diff, 'endAt')) return pairText(diff, 'endAt');
  if (field(diff, 'startAt')) return pairText(diff, 'startAt');
  return '변경';
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
