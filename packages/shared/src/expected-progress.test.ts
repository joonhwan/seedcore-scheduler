import { describe, it, expect } from 'vitest';
import {
  countWorkingDays,
  calculateExpectedProgress,
  getNodeDelayInfo,
  calculateTreeNodesDelayInfo,
  calculateProjectDelaySummary,
} from './expected-progress';

describe('countWorkingDays', () => {
  it('평일 일수를 정확히 계산함 (주말 제외)', () => {
    // 2026-08-07(금) ~ 2026-08-11(화): 금(8/7), 월(8/10) -> [8/7, 8/11) 기간 중 영업일 2일 (금, 월)
    expect(countWorkingDays('2026-08-07', '2026-08-11')).toBe(2);
    // 2026-08-08(토) ~ 2026-08-10(월): [8/8, 8/10) 기간 중 영업일 0일 (토, 일)
    expect(countWorkingDays('2026-08-08', '2026-08-10')).toBe(0);
  });
});

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

  it('주말(토/일) 제외 영업일 기준 비율 계산 및 주말 동결 특성', () => {
    // 금요일(8/7) ~ 화요일(8/11) -> 총 2영업일 [8/7(금), 8/10(월)]
    // 8/7(금): 0영업일 경과 -> 0%
    expect(calculateExpectedProgress('2026-08-07', '2026-08-11', '2026-08-07')).toBe(0);
    // 8/8(토): 금 1영업일 경과 -> 1/2 = 50%
    expect(calculateExpectedProgress('2026-08-07', '2026-08-11', '2026-08-08')).toBe(50);
    // 8/9(일): 주말이므로 금요일 상태 동결 50%
    expect(calculateExpectedProgress('2026-08-07', '2026-08-11', '2026-08-09')).toBe(50);
    // 8/10(월): 금 1영업일 경과 -> 50%
    expect(calculateExpectedProgress('2026-08-07', '2026-08-11', '2026-08-10')).toBe(50);
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

  it('완료일이 이미 지났고 진척율 100% 미만 -> delayGap 5%p여도 status CRITICAL (진척율 상관없이 일정 지연)', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-05',
        progress: 95,
      },
      '2026-08-07',
    );
    expect(res.expectedProgress).toBe(100);
    expect(res.actualProgress).toBe(95);
    expect(res.delayGap).toBe(5);
    expect(res.status).toBe('CRITICAL');
  });

  it('완료일이 이미 지났으나 진척율 100% 완료 -> status ON_TRACK', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-05',
        progress: 100,
      },
      '2026-08-07',
    );
    expect(res.expectedProgress).toBe(100);
    expect(res.actualProgress).toBe(100);
    expect(res.delayGap).toBe(0);
    expect(res.status).toBe('ON_TRACK');
  });
});

describe('calculateTreeNodesDelayInfo (버블업 지연 전파)', () => {
  it('모든 하위 ITEM 노드가 정상인 경우 상위 GROUP 노드도 ON_TRACK', () => {
    const nodes = [
      { id: 'group1', kind: 'GROUP', parentId: null, progressEffective: 39 },
      { id: 'item1', kind: 'ITEM', parentId: 'group1', startAt: '2026-07-17', endAt: '2026-07-31', progress: 100 },
      { id: 'item2', kind: 'ITEM', parentId: 'group1', startAt: '2026-08-03', endAt: '2026-08-03', progress: 100 },
      { id: 'item3', kind: 'ITEM', parentId: 'group1', startAt: '2026-08-04', endAt: '2026-08-05', progress: 0 },
      { id: 'item4', kind: 'ITEM', parentId: 'group1', startAt: '2026-08-13', endAt: '2026-08-13', progress: 10 },
    ];
    const map = calculateTreeNodesDelayInfo(nodes, '2026-08-03');
    const groupInfo = map.get('group1')!;
    expect(groupInfo.status).toBe('ON_TRACK');
  });

  it('하위 ITEM 노드 중 1개라도 CRITICAL이 있으면 상위 GROUP 노드도 CRITICAL 로 전파', () => {
    const nodes = [
      { id: 'group1', kind: 'GROUP', parentId: null },
      { id: 'item1', kind: 'ITEM', parentId: 'group1', startAt: '2026-07-17', endAt: '2026-07-31', progress: 100 },
      { id: 'item2', kind: 'ITEM', parentId: 'group1', startAt: '2026-08-01', endAt: '2026-08-10', progress: 0 }, // expected 30% -> gap 30%p -> CRITICAL
    ];
    const map = calculateTreeNodesDelayInfo(nodes, '2026-08-04');
    const groupInfo = map.get('group1')!;
    expect(groupInfo.status).toBe('CRITICAL');
  });
});

describe('calculateProjectDelaySummary', () => {
  it('여러 노드의 진척 현황을 종합 집계한다', () => {
    const nodes = [
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 10 }, // expected 50, gap 40 -> CRITICAL
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 50 }, // expected 50, gap 0 -> ON_TRACK
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 38 }, // expected 50, gap 12 -> WARNING
    ];
    const summary = calculateProjectDelaySummary(nodes, '2026-08-06');
    expect(summary.totalNodes).toBe(3);
    expect(summary.validNodes).toBe(3);
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.onTrackCount).toBe(1);
    expect(summary.avgExpectedProgress).toBe(50);
    expect(summary.avgActualProgress).toBe(33);
    expect(summary.avgDelayGap).toBe(17);
    expect(summary.status).toBe('CRITICAL');
  });
});
