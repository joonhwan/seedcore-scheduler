// 프로젝트 복제 시 일정 날짜를 새 기간으로 옮기는 순수 함수들.
//
// API 가 실제 복제에서 쓰는 계산과 web 이 화면에 보여주는 미리보기가 어긋나면 안 되므로
// shared 에 둔다. 날짜는 'YYYY-MM-DD' 문자열이라 UTC epoch-day 정수로 바꿔 산술한다
// (schema.prisma 의 start_at/end_at 이 DateTime 이 아니라 String 이므로 타임존 함정이 없다).

const MS_PER_DAY = 86_400_000;

export type CloneDateMode = 'KEEP' | 'SHIFT' | 'FIT';

export interface DatePair {
  startAt: string | null;
  endAt: string | null;
}

export interface DateSpan {
  start: string;
  end: string;
}

/**
 * 모드별 사상 계획. 한 번 만들어 두고 노드마다 remapDatePair 로 반복 적용한다.
 * FIT 의 네 값은 모두 epoch-day 정수다.
 */
export type RemapPlan =
  | { mode: 'KEEP' }
  | { mode: 'SHIFT'; deltaDays: number }
  | { mode: 'FIT'; srcStart: number; srcEnd: number; dstStart: number; dstEnd: number };

export function toEpochDay(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  // Date.UTC(y, ...) 는 0~99 년을 1900~1999 로 매핑하는 레거시 특례가 있다 (두 자리 연도
  // 입력이 조용히 1900년대로 밀리는 원인). setUTCFullYear 는 그 특례가 없으므로 우회용으로 쓴다.
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return Math.floor(dt.getTime() / MS_PER_DAY);
}

export function fromEpochDay(day: number): string {
  const dt = new Date(day * MS_PER_DAY);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 원본 일정에서 [최소 시작일, 최대 종료일] 을 뽑는다. 날짜가 하나도 없으면 null.
 * 'YYYY-MM-DD' 는 사전순 비교가 시간순 비교와 일치하므로 문자열로 직접 비교한다.
 */
export function findDateSpan(items: DatePair[]): DateSpan | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const item of items) {
    for (const value of [item.startAt, item.endAt]) {
      if (!value) continue;
      if (min === null || value < min) min = value;
      if (max === null || value > max) max = value;
    }
  }
  if (min === null || max === null) return null;
  return { start: min, end: max };
}

/**
 * 호출자는 SHIFT/FIT 을 쓰기 전에 span 이 null 이 아님을 보장해야 한다.
 * 여기서 던지는 Error 는 방어용 backstop 이다 (API 는 400, web 은 옵션 비활성화로 미리 막는다).
 */
export function buildRemapPlan(
  span: DateSpan | null,
  input: {
    mode: CloneDateMode;
    newStartDate?: string | undefined;
    newEndDate?: string | undefined;
  },
): RemapPlan {
  if (input.mode === 'KEEP') return { mode: 'KEEP' };
  if (span === null) throw new Error('NO_DATED_ITEMS');
  if (!input.newStartDate) throw new Error('NEW_START_DATE_REQUIRED');

  if (input.mode === 'SHIFT') {
    return {
      mode: 'SHIFT',
      deltaDays: toEpochDay(input.newStartDate) - toEpochDay(span.start),
    };
  }

  if (!input.newEndDate) throw new Error('NEW_END_DATE_REQUIRED');
  return {
    mode: 'FIT',
    srcStart: toEpochDay(span.start),
    srcEnd: toEpochDay(span.end),
    dstStart: toEpochDay(input.newStartDate),
    dstEnd: toEpochDay(input.newEndDate),
  };
}

function remapOne(date: string, plan: RemapPlan): string {
  if (plan.mode === 'KEEP') return date;

  const day = toEpochDay(date);
  if (plan.mode === 'SHIFT') return fromEpochDay(day + plan.deltaDays);

  const srcLen = plan.srcEnd - plan.srcStart;
  const dstLen = plan.dstEnd - plan.dstStart;
  // 원본 전체가 하루면 비례 배분할 축이 없다. 0 으로 나누지 않고 새 시작일로 모은다.
  if (srcLen === 0) return fromEpochDay(plan.dstStart);

  const mapped = plan.dstStart + Math.round(((day - plan.srcStart) * dstLen) / srcLen);
  const lo = Math.min(plan.dstStart, plan.dstEnd);
  const hi = Math.max(plan.dstStart, plan.dstEnd);
  return fromEpochDay(Math.min(hi, Math.max(lo, mapped)));
}

/**
 * 한 일정의 날짜 한 쌍을 사상한다. 각 필드를 독립 사상하고, null 은 null 로 남긴다.
 * 반올림·clamp 때문에 endAt 이 startAt 보다 앞서면 startAt 으로 맞춘다.
 */
export function remapDatePair(pair: DatePair, plan: RemapPlan): DatePair {
  const startAt = pair.startAt === null ? null : remapOne(pair.startAt, plan);
  let endAt = pair.endAt === null ? null : remapOne(pair.endAt, plan);
  if (startAt !== null && endAt !== null && endAt < startAt) endAt = startAt;
  return { startAt, endAt };
}
