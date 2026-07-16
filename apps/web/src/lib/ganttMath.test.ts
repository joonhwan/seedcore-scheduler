import { describe, it, expect } from 'vitest';
import {
  parseYmd,
  formatYmd,
  addDays,
  dayDiff,
  pxToDays,
  resizeItem,
  moveItem,
  applyDrag,
} from './ganttMath';

describe('parseYmd / formatYmd', () => {
  it('round-trips a date string', () => {
    expect(formatYmd(parseYmd('2026-03-15'))).toBe('2026-03-15');
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-03-15', 3)).toBe('2026-03-18');
  });
  it('adds negative days', () => {
    expect(addDays('2026-03-15', -5)).toBe('2026-03-10');
  });
  it('crosses month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('dayDiff', () => {
  it('returns whole-day difference', () => {
    expect(dayDiff(parseYmd('2026-03-18'), parseYmd('2026-03-15'))).toBe(3);
  });
});

describe('pxToDays', () => {
  it('rounds pixel delta to nearest day', () => {
    expect(pxToDays(72, 36)).toBe(2);
    expect(pxToDays(50, 36)).toBe(1); // 1.39 -> 1
    expect(pxToDays(-72, 36)).toBe(-2);
    expect(pxToDays(10, 36)).toBe(0); // 0.28 -> 0
  });
});

describe('resizeItem', () => {
  it('moves the start edge', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'start', 3)).toEqual({
      startAt: '2026-03-18',
      endAt: '2026-03-20',
    });
  });
  it('clamps start to at most endAt (min 1 day)', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'start', 99)).toEqual({
      startAt: '2026-03-20',
      endAt: '2026-03-20',
    });
  });
  it('moves the end edge', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'end', -3)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-17',
    });
  });
  it('clamps end to at least startAt (min 1 day)', () => {
    expect(resizeItem('2026-03-15', '2026-03-20', 'end', -99)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-15',
    });
  });
});

describe('moveItem', () => {
  it('shifts both edges preserving span', () => {
    expect(moveItem('2026-03-15', '2026-03-20', 5)).toEqual({
      startAt: '2026-03-20',
      endAt: '2026-03-25',
    });
  });
});

describe('applyDrag', () => {
  it('dispatches by mode', () => {
    expect(applyDrag('2026-03-15', '2026-03-20', 'move', 2)).toEqual({
      startAt: '2026-03-17',
      endAt: '2026-03-22',
    });
    expect(applyDrag('2026-03-15', '2026-03-20', 'resize-start', 2)).toEqual({
      startAt: '2026-03-17',
      endAt: '2026-03-20',
    });
    expect(applyDrag('2026-03-15', '2026-03-20', 'resize-end', 2)).toEqual({
      startAt: '2026-03-15',
      endAt: '2026-03-22',
    });
  });
});
