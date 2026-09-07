import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SESSION_WINDOW_MS,
  CreateServerNoticeDto,
  DEFAULT_RESTART_NOTICE_MESSAGE,
  SERVER_NOTICE_WARNING_MS,
} from './index';

describe('CreateServerNoticeDto', () => {
  const ok = {
    kind: 'RESTART' as const,
    message: '점검합니다',
    scheduledAt: '2026-09-07T10:00:00.000Z',
  };

  it('올바른 입력을 통과시킨다', () => {
    expect(CreateServerNoticeDto.parse(ok)).toEqual(ok);
  });

  it('kind 는 RESTART 만 받는다', () => {
    expect(() => CreateServerNoticeDto.parse({ ...ok, kind: 'MAINTENANCE' })).toThrow();
  });

  it('빈 안내 문구를 거부한다', () => {
    expect(() => CreateServerNoticeDto.parse({ ...ok, message: '' })).toThrow();
  });

  it('500자를 넘는 안내 문구를 거부한다', () => {
    expect(() => CreateServerNoticeDto.parse({ ...ok, message: 'ㄱ'.repeat(501) })).toThrow();
  });

  it('시각이 ISO 8601 이 아니면 거부한다', () => {
    expect(() => CreateServerNoticeDto.parse({ ...ok, scheduledAt: '2026-09-07 10:00' })).toThrow();
  });
});

describe('상수', () => {
  it('예고 팝업은 5분 전부터 뜬다', () => {
    expect(SERVER_NOTICE_WARNING_MS).toBe(5 * 60 * 1000);
  });

  it('접속 판정 창도 5분이다', () => {
    expect(ACTIVE_SESSION_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  it('기본 안내 문구가 비어 있지 않다', () => {
    expect(DEFAULT_RESTART_NOTICE_MESSAGE.length).toBeGreaterThan(0);
  });
});
