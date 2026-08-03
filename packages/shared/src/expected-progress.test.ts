import { describe, it, expect } from 'vitest';
import {
  calculateExpectedProgress,
  getNodeDelayInfo,
  calculateProjectDelaySummary,
} from './expected-progress';

describe('calculateExpectedProgress', () => {
  it('날짜가 없으면 null 반환', () => {
    expect(calculateExpectedProgress(null, '2026-08-10')).toBeNull();
    expect(calculateExpectedProgress('2026-08-01', undefined)).toBeNull();
  });

  it('시작일 이전이면 0%', () => {
    expect(calculateExpectedProgress('2026-08-05', '2026-08-15', '2026-08-01')).toBe(0);
  });

  it('종료일 이상이면 100%', () => {
    expect(calculateExpectedProgress('2026-08-05', '2026-08-15', '2026-08-15')).toBe(100);
    expect(calculateExpectedProgress('2026-08-05', '2026-08-15', '2026-08-20')).toBe(100);
  });

  it('기간 중간일 때 비율 계산', () => {
    // 2026-08-01 ~ 2026-08-11 (10일 간격)
    // 2026-08-06 -> 5일 경과 / 10일 = 50%
    expect(calculateExpectedProgress('2026-08-01', '2026-08-11', '2026-08-06')).toBe(50);

    // 2026-08-01 ~ 2026-08-05 (4일 간격)
    // 2026-08-02 -> 1일 경과 / 4일 = 25%
    expect(calculateExpectedProgress('2026-08-01', '2026-08-05', '2026-08-02')).toBe(25);
  });

  it('시작일과 종료일이 같을 때', () => {
    expect(calculateExpectedProgress('2026-08-05', '2026-08-05', '2026-08-04')).toBe(0);
    expect(calculateExpectedProgress('2026-08-05', '2026-08-05', '2026-08-05')).toBe(100);
  });
});

describe('getNodeDelayInfo', () => {
  it('예상 진척률 50%, 실제 진척률 20% -> delayGap 30%p, status CRITICAL', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-11',
        progress: 20,
      },
      '2026-08-06',
    );
    expect(res.expectedProgress).toBe(50);
    expect(res.actualProgress).toBe(20);
    expect(res.delayGap).toBe(30);
    expect(res.status).toBe('CRITICAL');
  });

  it('예상 진척률 50%, 실제 진척률 40% -> delayGap 10%p, status WARNING', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-11',
        progress: 40,
      },
      '2026-08-06',
    );
    expect(res.delayGap).toBe(10);
    expect(res.status).toBe('WARNING');
  });

  it('예상 진척률 50%, 실제 진척률 50% -> delayGap 0, status ON_TRACK', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-11',
        progress: 50,
      },
      '2026-08-06',
    );
    expect(res.delayGap).toBe(0);
    expect(res.status).toBe('ON_TRACK');
  });

  it('effective 필드가 있으면 수동 입력 필드보다 우선', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-01-01',
        endAt: '2026-01-10',
        startAtEffective: '2026-08-01',
        endAtEffective: '2026-08-11',
        progress: 0,
        progressEffective: 50,
      },
      '2026-08-06',
    );
    expect(res.expectedProgress).toBe(50);
    expect(res.actualProgress).toBe(50);
    expect(res.status).toBe('ON_TRACK');
  });
});

describe('calculateProjectDelaySummary', () => {
  it('여러 노드의 진척 현황을 종합 집계한다', () => {
    const nodes = [
      { startAt: '2026-08-01', endAt: '2026-08-11', progress: 10 }, // expected 50, gap 40 -> CRITICAL
      { startAt: '2026-08-01', endAt: '2026-08-11', progress: 50 }, // expected 50, gap 0 -> ON_TRACK
      { startAt: '2026-08-01', endAt: '2026-08-11', progress: 38 }, // expected 50, gap 12 -> WARNING
    ];
    const summary = calculateProjectDelaySummary(nodes, '2026-08-06');
    expect(summary.totalNodes).toBe(3);
    expect(summary.validNodes).toBe(3);
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.onTrackCount).toBe(1);
    expect(summary.avgExpectedProgress).toBe(50);
    expect(summary.avgActualProgress).toBe(33); // (10+50+38)/3 = 32.66 -> 33
    expect(summary.avgDelayGap).toBe(17);
    expect(summary.status).toBe('CRITICAL');
  });
});
