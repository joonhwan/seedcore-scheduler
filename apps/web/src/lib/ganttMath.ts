// 간트 드래그 편집용 순수 날짜/픽셀 계산 유틸.
// UTC 자정 기준 "YYYY-MM-DD" 문자열을 다룬다. 부수효과 없음(테스트 대상).

export type DragMode = 'resize-start' | 'resize-end' | 'move';

const MS_PER_DAY = 86400000;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(ymd: string, n: number): string {
  return formatYmd(new Date(parseYmd(ymd).getTime() + n * MS_PER_DAY));
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function pxToDays(dx: number, ppd: number): number {
  return Math.round(dx / ppd);
}

// startAt <= endAt 을 유지한다(최소 1일: startAt === endAt 까지 허용).
// 날짜 문자열은 "YYYY-MM-DD" 라 사전순 비교가 곧 시간순 비교다.
export function resizeItem(
  startAt: string,
  endAt: string,
  edge: 'start' | 'end',
  deltaDays: number,
): { startAt: string; endAt: string } {
  if (edge === 'start') {
    let ns = addDays(startAt, deltaDays);
    if (ns > endAt) ns = endAt;
    return { startAt: ns, endAt };
  }
  let ne = addDays(endAt, deltaDays);
  if (ne < startAt) ne = startAt;
  return { startAt, endAt: ne };
}

export function moveItem(
  startAt: string,
  endAt: string,
  deltaDays: number,
): { startAt: string; endAt: string } {
  return {
    startAt: addDays(startAt, deltaDays),
    endAt: addDays(endAt, deltaDays),
  };
}

export function applyDrag(
  startAt: string,
  endAt: string,
  mode: DragMode,
  deltaDays: number,
): { startAt: string; endAt: string } {
  if (mode === 'move') return moveItem(startAt, endAt, deltaDays);
  if (mode === 'resize-start') return resizeItem(startAt, endAt, 'start', deltaDays);
  return resizeItem(startAt, endAt, 'end', deltaDays);
}
