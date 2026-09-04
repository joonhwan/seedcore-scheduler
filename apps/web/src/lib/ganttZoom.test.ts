import { describe, it, expect } from 'vitest';
import { PPD } from './ganttLayout';
import {
  MIN_PPD,
  MAX_PPD,
  ZOOM_STEP,
  clampPpd,
  ppdToPercent,
  ppdToPercentExact,
  percentToPpd,
  zoomPpd,
  ppdToSlider,
  sliderToPpd,
  SLIDER_MIN,
  SLIDER_MAX,
} from './ganttZoom';

describe('constants', () => {
  it('배율 하한·상한과 한 단계 비율을 고정한다', () => {
    // Timeline 의 화면맞춤과 확대·축소가 같은 값으로 자르도록 한 곳에 모았다.
    expect(MIN_PPD).toBe(0.5);
    expect(MAX_PPD).toBe(100);
    // 요청 6번: 한 번 누를 때 30% 가 아니라 10% 씩 움직인다.
    expect(ZOOM_STEP).toBe(1.1);
  });

  it('슬라이더 눈금은 0~1000 정수로 잘게 나눈다', () => {
    // 눈금을 0~100 으로 잡으면 되돌림 오차가 배율 36 부근에서 0.54 까지 벌어져,
    // 손잡이를 놓은 자리와 표시 배율이 어긋난다. 열 배 잘게 나누면 0.04 로 줄어든다.
    expect(SLIDER_MIN).toBe(0);
    expect(SLIDER_MAX).toBe(1000);
  });
});

describe('clampPpd', () => {
  it('하한과 상한 밖의 값을 잘라낸다', () => {
    expect(clampPpd(0.1)).toBe(MIN_PPD);
    expect(clampPpd(1000)).toBe(MAX_PPD);
  });

  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampPpd(36)).toBe(36);
  });
});

describe('ppdToPercent', () => {
  // 100% 의 기준은 일 단위 기본 배율(36px/일)로 고정했다. 단위가 ppd 에서 파생되기 때문에
  // 현재 단위를 기준으로 삼으면 단위 경계에서 표시 숫자가 튄다.
  it('일 단위 기본 배율이 100% 다', () => {
    expect(ppdToPercent(PPD.day)).toBe(100);
  });

  it('나머지 단위의 기본 배율을 정수 퍼센트로 돌려준다', () => {
    expect(ppdToPercent(PPD.week)).toBe(28); // 10/36 = 27.8
    expect(ppdToPercent(PPD.month)).toBe(11); // 4/36 = 11.1
    expect(ppdToPercent(PPD.quarter)).toBe(6); // 2/36 = 5.6
  });

  it('하한과 상한의 표시값은 1% 와 278% 다', () => {
    expect(ppdToPercent(MIN_PPD)).toBe(1); // 0.5/36 = 1.4
    expect(ppdToPercent(MAX_PPD)).toBe(278); // 100/36 = 277.8
  });

  it('단위 경계를 지나도 표시값이 단조롭게 이어진다', () => {
    // activeUnit 은 ppd >= 24 에서 'day', >= 6 에서 'week' 로 갈린다.
    // 그 경계에서 숫자가 거꾸로 뛰지 않는 것이 이 기준을 고른 이유다.
    expect(ppdToPercent(25)).toBeGreaterThan(ppdToPercent(24));
    expect(ppdToPercent(24)).toBeGreaterThan(ppdToPercent(23));
    expect(ppdToPercent(7)).toBeGreaterThan(ppdToPercent(6));
    expect(ppdToPercent(6)).toBeGreaterThan(ppdToPercent(5));
  });
});

describe('ppdToPercentExact', () => {
  it('반올림하지 않은 퍼센트를 돌려준다', () => {
    expect(ppdToPercentExact(PPD.day)).toBe(100);
    expect(ppdToPercentExact(PPD.week)).toBeCloseTo(27.778, 3);
  });

  it('눈금을 실수 퍼센트로 옮겨 되돌리면 손잡이가 제자리에 머문다', () => {
    // 정수 퍼센트를 거치면 낮은 배율 구간에서 눈금 250 이 242 로 되돌아왔다.
    for (const at of [0, 100, 250, 500, 807, 1000]) {
      const percent = ppdToPercentExact(sliderToPpd(at));
      expect(ppdToSlider(percentToPpd(percent))).toBe(at);
    }
  });
});

describe('percentToPpd', () => {
  it('100% 는 일 단위 기본 배율로 돌아온다', () => {
    expect(percentToPpd(100)).toBe(PPD.day);
  });

  it('범위를 벗어난 퍼센트는 잘라낸다', () => {
    expect(percentToPpd(0)).toBe(MIN_PPD);
    expect(percentToPpd(10000)).toBe(MAX_PPD);
  });

  it('퍼센트로 바꾼 뒤 되돌리면 반올림 오차 안에서 같은 배율이다', () => {
    for (const ppd of [2, 4, 10, 20, 36, 60, 90]) {
      expect(percentToPpd(ppdToPercent(ppd))).toBeCloseTo(ppd, 0);
    }
  });
});

describe('zoomPpd', () => {
  it('확대는 10% 키우고 축소는 되돌린다', () => {
    expect(zoomPpd(36, true)).toBeCloseTo(39.6, 5);
    expect(zoomPpd(36, false)).toBeCloseTo(36 / 1.1, 5);
  });

  it('확대한 뒤 축소하면 원래 배율로 돌아온다', () => {
    expect(zoomPpd(zoomPpd(20, true), false)).toBeCloseTo(20, 5);
  });

  it('상한·하한에서 더 눌러도 넘어가지 않는다', () => {
    expect(zoomPpd(MAX_PPD, true)).toBe(MAX_PPD);
    expect(zoomPpd(MIN_PPD, false)).toBe(MIN_PPD);
  });
});

describe('슬라이더 눈금', () => {
  // 0.5~100 을 선형으로 깔면 실제로 쓰는 구간(분기 2 부터 일 36 까지)이 손잡이 왼쪽
  // 3분의 1 에 뭉쳐 조절이 되지 않는다. 그래서 로그 눈금으로 매핑한다.
  it('양 끝이 슬라이더의 양 끝에 붙는다', () => {
    expect(ppdToSlider(MIN_PPD)).toBe(SLIDER_MIN);
    expect(ppdToSlider(MAX_PPD)).toBe(SLIDER_MAX);
    expect(sliderToPpd(SLIDER_MIN)).toBe(MIN_PPD);
    expect(sliderToPpd(SLIDER_MAX)).toBe(MAX_PPD);
  });

  it('실제로 쓰는 구간이 슬라이더 가운데에 넓게 퍼진다', () => {
    // 선형 눈금이라면 분기(2) 는 전체의 1.5%, 일(36) 은 35.7% 자리에 몰려
    // 정작 쓰는 구간이 손잡이 왼쪽 3분의 1 에 뭉친다. 눈금 개수에 매이지 않도록
    // 전체 범위에 대한 비율로 확인한다.
    const span = SLIDER_MAX - SLIDER_MIN;
    expect(ppdToSlider(PPD.quarter)).toBeGreaterThan(span * 0.2);
    expect(ppdToSlider(PPD.day)).toBeLessThan(span * 0.9);
    // 네 단위의 기본 배율이 눈금 위에서 고르게 벌어져 있어야 끌어 맞출 수 있다.
    const gaps = [
      ppdToSlider(PPD.week) - ppdToSlider(PPD.quarter),
      ppdToSlider(PPD.day) - ppdToSlider(PPD.week),
    ];
    for (const gap of gaps) expect(gap).toBeGreaterThan(span * 0.15);
  });

  it('눈금 위치가 배율에 따라 단조롭게 늘어난다', () => {
    let prev = -1;
    for (const ppd of [0.5, 1, 2, 4, 10, 24, 36, 60, 100]) {
      const at = ppdToSlider(ppd);
      expect(at).toBeGreaterThan(prev);
      prev = at;
    }
  });

  it('눈금으로 바꾼 뒤 되돌리면 반올림 오차 안에서 같은 배율이다', () => {
    for (const ppd of [1, 2, 4, 10, 24, 36, 60]) {
      expect(sliderToPpd(ppdToSlider(ppd))).toBeCloseTo(ppd, 0);
    }
  });

  it('눈금 값이 범위를 벗어나도 배율은 범위 안에 머문다', () => {
    expect(sliderToPpd(SLIDER_MIN - 10)).toBe(MIN_PPD);
    expect(sliderToPpd(SLIDER_MAX + 10)).toBe(MAX_PPD);
  });
});
