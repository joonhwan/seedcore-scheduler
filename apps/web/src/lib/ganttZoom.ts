// 간트 배율(ppd = pixels per day) 을 사람이 읽는 퍼센트와 슬라이더 눈금으로 옮기는 순수 모듈.
// Timeline 은 ppd 로만 계산하고, 도구막대는 여기서 얻은 퍼센트·눈금만 다룬다.
import { PPD } from './ganttLayout';

/** 배율 하한. 이보다 축소하면 막대가 1px 미만이 되어 보이지 않는다. */
export const MIN_PPD = 0.5;
/** 배율 상한. 이보다 확대하면 하루 칸이 화면을 넘어 스크롤만 길어진다. */
export const MAX_PPD = 100;

/**
 * 확대·축소 한 단계의 비율. 요청 6번으로 1.3(약 30%) 에서 1.1(10%) 로 좁혔다.
 * 곱셈으로 두는 것은 어느 배율에서든 한 번 누를 때의 체감을 같게 하기 위함이다.
 */
export const ZOOM_STEP = 1.1;

/**
 * 퍼센트 표시의 기준. 일 단위 기본 배율(36px/일) 을 100% 로 고정한다.
 *
 * 현재 단위를 기준으로 삼지 않는 이유가 있다. Timeline 의 단위는 사용자가 고르는 값이 아니라
 * ppd 에서 파생되므로(`ppd >= 24` 면 일, `>= 6` 이면 주, `>= 3` 이면 월), 단위별 기본값을
 * 100% 로 잡으면 축소하다 단위가 바뀌는 순간 67% 에서 230% 로 튄다.
 */
const PERCENT_BASE_PPD = PPD.day;

/** 슬라이더 눈금 범위. 0~100 으로 잡으면 되돌림 오차가 배율 36 부근에서 0.5 를 넘는다. */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 1000;

const LOG_MIN = Math.log(MIN_PPD);
const LOG_SPAN = Math.log(MAX_PPD) - LOG_MIN;

export function clampPpd(ppd: number): number {
  return Math.max(MIN_PPD, Math.min(ppd, MAX_PPD));
}

/**
 * 배율을 퍼센트로 바꾼다. 반올림하지 않는다.
 *
 * 상태로 들고 다니는 값은 이쪽이어야 한다. 정수로 반올림한 퍼센트를 상태에 담으면 낮은 배율
 * 구간에서 값이 뭉쳐(1%~5% 사이에 다섯 값밖에 없다) 슬라이더 손잡이가 놓은 자리에서
 * 되돌아온다. 반올림은 화면에 찍는 순간에만 한다.
 */
export function ppdToPercentExact(ppd: number): number {
  return (clampPpd(ppd) / PERCENT_BASE_PPD) * 100;
}

/** 배율을 화면에 보여줄 정수 퍼센트로 바꾼다. 표시 범위는 1%~278% 다. */
export function ppdToPercent(ppd: number): number {
  return Math.round(ppdToPercentExact(ppd));
}

/** 퍼센트를 배율로 되돌린다. 범위를 벗어난 입력은 하한·상한으로 자른다. */
export function percentToPpd(percent: number): number {
  return clampPpd((percent / 100) * PERCENT_BASE_PPD);
}

/** 확대·축소 한 단계를 적용한 배율. 하한·상한에서 더 눌러도 넘어가지 않는다. */
export function zoomPpd(ppd: number, zoomIn: boolean): number {
  return clampPpd(ppd * (zoomIn ? ZOOM_STEP : 1 / ZOOM_STEP));
}

/**
 * 배율을 슬라이더 눈금 위치로 바꾼다. 로그 눈금인 이유는 선형으로 깔면 실제로 쓰는
 * 구간(분기 2 부터 일 36 까지)이 손잡이 왼쪽 3분의 1 에 뭉쳐 조절이 되지 않기 때문이다.
 */
export function ppdToSlider(ppd: number): number {
  const ratio = (Math.log(clampPpd(ppd)) - LOG_MIN) / LOG_SPAN;
  return Math.round(SLIDER_MIN + ratio * (SLIDER_MAX - SLIDER_MIN));
}

/** 슬라이더 눈금 위치를 배율로 되돌린다. */
export function sliderToPpd(value: number): number {
  const ratio = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
  return clampPpd(Math.exp(LOG_MIN + ratio * LOG_SPAN));
}
