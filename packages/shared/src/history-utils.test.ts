import { describe, it, expect } from 'vitest';
import {
  getProgressChange,
  isProgressDown,
  isPeriodChange,
  classifyChange,
} from './history-utils';

describe('getProgressChange', () => {
  it('progress 의 from/to 가 숫자면 그대로 반환', () => {
    expect(getProgressChange({ progress: { from: 80, to: 50 } })).toEqual({ from: 80, to: 50 });
  });
  it('progress 가 없으면 null', () => {
    expect(getProgressChange({ title: { from: 'a', to: 'b' } })).toBeNull();
  });
  it('from/to 가 숫자가 아니면 null', () => {
    expect(getProgressChange({ progress: { from: null, to: 50 } })).toBeNull();
  });
});

describe('isProgressDown', () => {
  it('to < from 이면 참', () => {
    expect(isProgressDown({ progress: { from: 80, to: 50 } })).toBe(true);
  });
  it('to > from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 80 } })).toBe(false);
  });
  it('to === from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 50 } })).toBe(false);
  });
  it('progress 변경이 없으면 거짓', () => {
    expect(isProgressDown({ title: { from: 'a', to: 'b' } })).toBe(false);
  });
});

describe('isPeriodChange', () => {
  it('startAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ startAt: { from: '2026-01-01', to: '2026-01-02' } })).toBe(true);
  });
  it('endAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ endAt: { from: null, to: '2026-02-15' } })).toBe(true);
  });
  it('기간 필드가 없으면 거짓', () => {
    expect(isPeriodChange({ progress: { from: 10, to: 20 } })).toBe(false);
  });
});

describe('classifyChange', () => {
  it('UPDATE + 진행률 내림 → PROGRESS_DOWN', () => {
    expect(classifyChange('UPDATE', { progress: { from: 80, to: 50 } })).toBe('PROGRESS_DOWN');
  });
  it('UPDATE + 진행률 올림 → PROGRESS_UP', () => {
    expect(classifyChange('UPDATE', { progress: { from: 50, to: 80 } })).toBe('PROGRESS_UP');
  });
  it('UPDATE + 100% 도달 → PROGRESS_DONE', () => {
    expect(classifyChange('UPDATE', { progress: { from: 90, to: 100 } })).toBe('PROGRESS_DONE');
  });
  it('UPDATE + 기간 변경 → PERIOD', () => {
    expect(classifyChange('UPDATE', { endAt: { from: '2026-01-31', to: '2026-02-15' } })).toBe('PERIOD');
  });
  it('UPDATE + 제목 변경 → TITLE', () => {
    expect(classifyChange('UPDATE', { title: { from: 'a', to: 'b' } })).toBe('TITLE');
  });
  it('DELETE → DELETE', () => {
    expect(classifyChange('DELETE', {})).toBe('DELETE');
  });
  it('CREATE → CREATE', () => {
    expect(classifyChange('CREATE', {})).toBe('CREATE');
  });
  it('MOVE → MOVE', () => {
    expect(classifyChange('MOVE', {})).toBe('MOVE');
  });
});
