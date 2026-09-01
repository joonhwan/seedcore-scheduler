/**
 * 세션 남은 시간 계산 (순수 함수 — 화면과 떼어 두고 테스트한다).
 *
 * 브라우저 시계를 빼기의 한쪽으로 쓰지 않는 것이 이 모듈의 핵심이다. 서버가 준
 * `sessionExpiresAt` 에서 브라우저의 현재 시각을 빼면, 사내 PC 시계가 몇 분 어긋나 있을 때
 * 연장 창이 엉뚱한 때에 뜨거나 아예 뜨지 않는다. 그래서 기준점을 두 개로 나눈다.
 *
 *  - 서버가 준 두 시각의 차이(`sessionExpiresAt - serverNow`) = 응답을 만든 순간의 남은 시간.
 *    두 값 모두 서버 시계라 오차가 상쇄된다.
 *  - 그 응답을 받은 뒤 흐른 시간은 브라우저 시계로 잰다. 이쪽은 절대 시각이 아니라 경과
 *    시간이라 시계가 어긋나 있어도 상관없다.
 */

export interface SessionClock {
  /** 서버가 알려준 세션 만료 시각 (ISO 8601). */
  sessionExpiresAt: string;
  /** 그 응답을 만든 서버 시각 (ISO 8601). */
  serverNow: string;
  /** 응답을 받은 시점의 브라우저 시각 (밀리초). TanStack Query 의 dataUpdatedAt 를 그대로 쓴다. */
  receivedAtLocalMs: number;
}

/**
 * 지금 시점의 남은 시간(밀리초). 이미 지났으면 0.
 *
 * @param nowLocalMs 지금의 브라우저 시각(밀리초)
 */
export function remainingMs(clock: SessionClock, nowLocalMs: number): number {
  const expires = Date.parse(clock.sessionExpiresAt);
  const server = Date.parse(clock.serverNow);
  if (!Number.isFinite(expires) || !Number.isFinite(server)) return 0;

  const atResponse = expires - server;
  const elapsed = nowLocalMs - clock.receivedAtLocalMs;
  const left = atResponse - elapsed;
  return left > 0 ? left : 0;
}

/**
 * 남은 시간을 사람이 읽는 문자열로. 초 단위까지 보여주는 것은 1분 미만일 때뿐이다.
 *
 * 연장 창은 "곧 끊긴다"를 체감시켜야 하므로 10분 미만에서는 분과 초를 함께 보여주고,
 * 그보다 남았으면 분·시간 단위로 뭉뚱그린다.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '만료됨';

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (totalMinutes >= 10) return `${totalMinutes}분`;
  if (totalMinutes > 0) return `${totalMinutes}분 ${String(seconds).padStart(2, '0')}초`;
  return `${seconds}초`;
}

/**
 * 다음 tick 까지 기다릴 간격.
 *
 * 남은 시간이 넉넉할 때까지 1 초마다 다시 그릴 이유가 없다. 표시가 분 단위로 바뀌는
 * 구간에서는 느슨하게, 초를 세어 보여주는 구간에서는 촘촘하게 돈다.
 */
export function tickIntervalMs(remaining: number): number {
  if (remaining <= 60 * 1000) return 1000;
  if (remaining <= 10 * 60 * 1000) return 1000;
  return 30 * 1000;
}
