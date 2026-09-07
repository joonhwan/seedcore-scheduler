/**
 * 재시작 예고 팝업이 뜨고 다시 뜨는 규칙 (순수 함수 — 화면과 떼어 두고 시험한다).
 *
 * 확정명세 ⑤ 는 "5분 전부터 뜨고, 확인으로 닫아도 1분마다 다시 뜬다"고 정했다. 이것을
 * "분 표지"라는 값 하나로 다룬다. 남은 시간을 자르지 않은 채 분 단위로 올림한 값이며,
 * 예정 시각을 지나면 음수로 이어진다.
 *
 * 그래서 5분 전 구간과 예정 시각이 지난 뒤의 구간이 같은 규칙 하나로 처리된다.
 */

/** 지금이 몇 분 구간인가. 4분 40초 남았으면 5, 정각이면 0, 70초 지났으면 -1. */
export function minuteMark(signedRemainingMs: number): number {
  return Math.ceil(signedRemainingMs / 60_000);
}

/**
 * 지금 팝업을 띄워야 하는가.
 *
 * @param dismissedMark 사용자가 "확인"을 눌러 닫았을 때의 분 표지. 닫은 적이 없으면 null.
 */
export function shouldShowNotice(args: {
  signedRemainingMs: number;
  warningMs: number;
  dismissedMark: number | null;
}): boolean {
  if (args.signedRemainingMs > args.warningMs) return false;
  if (args.dismissedMark === null) return true;
  // 닫은 구간을 벗어났으면 다시 알린다.
  return minuteMark(args.signedRemainingMs) !== args.dismissedMark;
}

/** 팝업에 보여줄 남은 시간. 예정 시각을 지나면 카운트다운 대신 사실을 알린다. */
export function formatNoticeRemaining(signedRemainingMs: number): string {
  if (signedRemainingMs <= 0) return '곧 재시작됩니다';

  const totalSeconds = Math.floor(signedRemainingMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  if (minutes > 0) return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
  return `${seconds}초`;
}
