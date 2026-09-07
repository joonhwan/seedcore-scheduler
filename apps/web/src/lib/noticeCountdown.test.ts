import { describe, expect, it } from 'vitest';
import { formatNoticeRemaining, minuteMark, shouldShowNotice } from './noticeCountdown';

const MIN = 60 * 1000;
const WARNING = 5 * MIN;

describe('minuteMark', () => {
  it('4분 40초 남았으면 5분 구간이다', () => {
    expect(minuteMark(4 * MIN + 40 * 1000)).toBe(5);
  });

  it('3분 10초 남았으면 4분 구간이다', () => {
    expect(minuteMark(3 * MIN + 10 * 1000)).toBe(4);
  });

  it('정각은 0 이다', () => {
    expect(minuteMark(0)).toBe(0);
  });

  it('지난 뒤에는 음수로 이어진다', () => {
    // 예정 시각이 지나도 1분마다 계속 알려야 하므로 표지가 끊기지 않아야 한다.
    expect(minuteMark(-70 * 1000)).toBe(-1);
    expect(minuteMark(-3 * MIN)).toBe(-3);
  });
});

describe('shouldShowNotice', () => {
  it('5분보다 많이 남았으면 뜨지 않는다', () => {
    expect(
      shouldShowNotice({ signedRemainingMs: 6 * MIN, warningMs: WARNING, dismissedMark: null }),
    ).toBe(false);
  });

  it('5분 안으로 들어오면 뜬다', () => {
    expect(
      shouldShowNotice({ signedRemainingMs: 4 * MIN, warningMs: WARNING, dismissedMark: null }),
    ).toBe(true);
  });

  it('닫은 구간에서는 다시 뜨지 않는다', () => {
    expect(
      shouldShowNotice({ signedRemainingMs: 4 * MIN + 30_000, warningMs: WARNING, dismissedMark: 5 }),
    ).toBe(false);
  });

  it('1분 경계를 지나면 다시 뜬다', () => {
    // 확정명세 ⑤: "닫은 뒤에도 1분마다 다시 떠서 남은 시간을 알린다"
    expect(
      shouldShowNotice({ signedRemainingMs: 3 * MIN + 30_000, warningMs: WARNING, dismissedMark: 5 }),
    ).toBe(true);
  });

  it('예정 시각이 지난 뒤에도 1분마다 다시 뜬다', () => {
    expect(
      shouldShowNotice({ signedRemainingMs: -30_000, warningMs: WARNING, dismissedMark: 0 }),
    ).toBe(false);
    expect(
      shouldShowNotice({ signedRemainingMs: -70_000, warningMs: WARNING, dismissedMark: 0 }),
    ).toBe(true);
  });
});

describe('formatNoticeRemaining', () => {
  it('1분 이상 남았으면 분과 초를 보여준다', () => {
    expect(formatNoticeRemaining(4 * MIN + 5 * 1000)).toBe('4분 05초');
  });

  it('1분 미만이면 초만 보여준다', () => {
    expect(formatNoticeRemaining(42 * 1000)).toBe('42초');
  });

  it('지났으면 그 사실을 알린다', () => {
    expect(formatNoticeRemaining(-1000)).toBe('곧 재시작됩니다');
  });
});
