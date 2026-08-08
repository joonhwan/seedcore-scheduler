import { describe, it, expect } from 'vitest';
import { describeBulkOutcome, emptyOutcome } from './bulkResult';

describe('describeBulkOutcome', () => {
  it('전부 성공하면 success 로 건수를 알린다', () => {
    const r = describeBulkOutcome({ ...emptyOutcome(), succeeded: 5 }, '삭제했습니다.');
    expect(r.variant).toBe('success');
    expect(r.message).toContain('5개');
  });

  it('부분 실패는 warning 이고 성공 건수를 반드시 포함한다', () => {
    // 이게 이 파일의 핵심이다. 예전에는 오류 한 줄만 떠서, 이미 반영된 건수를 모른 채
    // 사용자가 같은 작업을 다시 눌러 날짜가 두 번 밀리는 일이 생길 수 있었다.
    const r = describeBulkOutcome(
      { succeeded: 4, failed: 1, firstError: '다른 사용자가 먼저 변경했습니다.', skipped: 0 },
      '3일 연기했습니다.',
    );
    expect(r.variant).toBe('warning');
    expect(r.message).toContain('4개');
    expect(r.message).toContain('1개');
    expect(r.message).toContain('다른 사용자가 먼저 변경했습니다.');
  });

  it('전부 실패하면 error 로 알린다', () => {
    const r = describeBulkOutcome(
      { succeeded: 0, failed: 3, firstError: '권한이 없습니다.', skipped: 0 },
      '삭제했습니다.',
    );
    expect(r.variant).toBe('error');
    expect(r.message).toContain('3개 모두 실패');
    expect(r.message).toContain('권한이 없습니다.');
  });

  it('대상이 하나도 없으면 성공이라고 말하지 않는다', () => {
    const r = describeBulkOutcome(emptyOutcome(), '삭제했습니다.');
    expect(r.variant).toBe('warning');
    expect(r.message).toContain('처리할 일정이 없습니다');
  });

  it('건너뛴 건수를 함께 알린다 (이미 100% 인 항목 등)', () => {
    const r = describeBulkOutcome(
      { ...emptyOutcome(), succeeded: 2, skipped: 3 },
      '100% 완료로 설정했습니다.',
    );
    expect(r.variant).toBe('success');
    expect(r.message).toContain('2개');
    expect(r.message).toContain('3건은 대상이 아니어서 건너뜀');
  });

  it('건너뛴 것만 있고 처리한 것이 없으면 warning', () => {
    const r = describeBulkOutcome({ ...emptyOutcome(), skipped: 4 }, '완료했습니다.');
    expect(r.variant).toBe('warning');
    expect(r.message).toContain('처리할 일정이 없습니다');
    expect(r.message).toContain('4건');
  });

  it('firstError 가 없어도 문구가 깨지지 않는다', () => {
    const r = describeBulkOutcome(
      { succeeded: 1, failed: 1, firstError: null, skipped: 0 },
      '삭제했습니다.',
    );
    expect(r.variant).toBe('warning');
    expect(r.message).not.toContain('첫 오류');
  });
});
