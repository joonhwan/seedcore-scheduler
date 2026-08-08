/**
 * 대량 작업(선택한 여러 일정을 한꺼번에 삭제/완료/일정이동)의 결과 집계.
 *
 * 예전에는 루프 안에서 첫 실패에 catch 로 빠져나갔다. 그래서
 *  - 뒤에 남은 대상은 시도조차 되지 않았고,
 *  - 사용자에게는 오류 메시지 한 줄만 떠서 **몇 건이 이미 처리됐는지 알 수 없었다.**
 * 20개를 골라 "3일 연기" 를 눌렀는데 5번째가 409 로 실패하면, 화면에는 실패만 뜨고
 * 실제로는 4건이 이미 옮겨진 상태다. 사용자는 다시 20개를 골라 누르게 되고 그 4건은
 * 6일이 밀린다.
 *
 * 그래서 정책을 "끝까지 시도하고 결과를 합쳐 보고한다" 로 바꿨다. 대상 노드는 서로
 * 독립적이므로(한 건의 409 가 다른 건의 처리를 틀리게 만들지 않는다) 중간에 멈출 이유가 없다.
 */

export interface BulkOutcome {
  succeeded: number;
  failed: number;
  /** 첫 실패의 사용자용 메시지. 실패가 없으면 null */
  firstError: string | null;
  /** 대상이 아니어서 건너뛴 수 (이미 100% 인 항목 등). 성공/실패에 넣지 않는다 */
  skipped: number;
}

export function emptyOutcome(): BulkOutcome {
  return { succeeded: 0, failed: 0, firstError: null, skipped: 0 };
}

/**
 * 결과를 토스트 한 줄로 요약한다.
 *
 * @param outcome  집계 결과
 * @param doneVerb 성공을 서술하는 말 ("삭제했습니다", "3일 연기했습니다" 등)
 */
export function describeBulkOutcome(
  outcome: BulkOutcome,
  doneVerb: string,
): { variant: 'success' | 'warning' | 'error'; message: string } {
  const { succeeded, failed, firstError, skipped } = outcome;
  const skippedText = skipped > 0 ? ` (${skipped}건은 대상이 아니어서 건너뜀)` : '';

  if (failed === 0) {
    // 대상이 하나도 없던 경우까지 "성공" 으로 말하면 사용자가 뭔가 됐다고 오해한다.
    if (succeeded === 0) {
      return {
        variant: 'warning',
        message: `처리할 일정이 없습니다.${skippedText}`,
      };
    }
    return { variant: 'success', message: `${succeeded}개 일정을 ${doneVerb}${skippedText}` };
  }

  const errorText = firstError ? ` 첫 오류: ${firstError}` : '';
  if (succeeded === 0) {
    return {
      variant: 'error',
      message: `${failed}개 모두 실패했습니다.${errorText}`,
    };
  }
  // 부분 성공이 가장 위험한 상태다 — 몇 건이 이미 반영됐는지 반드시 알려야 한다.
  return {
    variant: 'warning',
    message: `${succeeded}개는 ${doneVerb} ${failed}개는 실패했습니다.${skippedText}${errorText}`,
  };
}
