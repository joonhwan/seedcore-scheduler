import { describe, it, expect } from 'vitest';
import {
  countWorkingDays,
  calculateExpectedProgress,
  getNodeDelayInfo,
  calculateTreeNodesDelayInfo,
  calculateProjectDelaySummary,
  DELAY_THRESHOLDS,
  getDelayStatusTooltip,
  getTodayIso,
  getItemNodeDelayInfo,
} from './expected-progress';

describe('"오늘" 의 정의는 파일 전체에서 하나여야 한다', () => {
  // calculateProjectDelaySummary 의 기본 기준일만 UTC 였던 적이 있다. KST(UTC+9)에서는
  // 00:00~08:59 동안 UTC 날짜가 하루 뒤처져, 그 시간대에 프로젝트 헤더 배지와 트리 각 행의
  // 배지가 서로 다른 기준일로 계산됐다. 기본값을 생략했을 때 두 경로가 같은 날을 보는지 본다.
  const dated = (startAt: string, endAt: string, progress: number) => ({
    id: 'n1',
    kind: 'ITEM',
    parentId: null,
    startAt,
    endAt,
    progress,
  });

  it('기본 기준일이 getTodayIso() 와 같다 — 어제/오늘 경계에서 갈리지 않는다', () => {
    const today = getTodayIso();
    // 오늘 하루짜리 일정: 기준일이 오늘이면 expectedProgress 가 확정된다.
    const nodes = [dated(today, today, 0)];

    const viaSummary = calculateProjectDelaySummary(nodes); // 기본값 사용
    const viaSummaryExplicit = calculateProjectDelaySummary(nodes, today);

    expect(viaSummary.avgExpectedProgress).toBe(viaSummaryExplicit.avgExpectedProgress);
    expect(viaSummary.status).toBe(viaSummaryExplicit.status);
  });

  it('요약과 개별 노드 계산이 같은 기준일을 쓴다', () => {
    const today = getTodayIso();
    const nodes = [dated(today, today, 0)];

    const summary = calculateProjectDelaySummary(nodes); // 기본값
    const item = getItemNodeDelayInfo(nodes[0]!); // 기본값

    expect(summary.avgExpectedProgress).toBe(item.expectedProgress);
    expect(summary.avgActualProgress).toBe(item.actualProgress);
  });

  it('getTodayIso() 는 UTC 가 아니라 로컬 날짜다', () => {
    const d = new Date();
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    expect(getTodayIso()).toBe(local);
  });
});

describe('DELAY_THRESHOLDS & getDelayStatusTooltip', () => {
  it('should export correct threshold constants', () => {
    expect(DELAY_THRESHOLDS.CRITICAL).toBe(30);
    expect(DELAY_THRESHOLDS.WARNING).toBe(15);
    expect(DELAY_THRESHOLDS.SLIGHT).toBe(0);
  });

  it('should return overdue message for CRITICAL when delayGap < 30', () => {
    const tooltip = getDelayStatusTooltip('CRITICAL', 29);
    expect(tooltip).toBe('마감일 경과 항목이 존재합니다. (29% 지연)');
  });

  it('should return standard 30% message for CRITICAL when delayGap >= 30', () => {
    const tooltip = getDelayStatusTooltip('CRITICAL', 35);
    expect(tooltip).toBe('예상보다 30% 이상 심각하게 지연 중입니다. (35% 지연)');
  });

  it('should return warning message for WARNING status', () => {
    const tooltip = getDelayStatusTooltip('WARNING', 20);
    expect(tooltip).toBe('예상보다 15% 이상 지연 중입니다. (20% 지연)');
  });

  it('should return slight message for SLIGHT status', () => {
    const tooltip = getDelayStatusTooltip('SLIGHT', 5);
    expect(tooltip).toBe('예상보다 소폭 지연 중입니다. (5% 지연)');
  });

  it('should return on-track message for ON_TRACK status', () => {
    const tooltip = getDelayStatusTooltip('ON_TRACK');
    expect(tooltip).toBe('예상 일정대로 정상 진행 중입니다.');
  });
});

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

  it('예상 진척률 50%, 실제 진척률 40% -> delayGap 10%p (0~14% 범위), status SLIGHT', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-11',
        progress: 40,
      },
      '2026-08-06',
    );
    expect(res.delayGap).toBe(10);
    expect(res.status).toBe('SLIGHT');
  });

  it('예상 진척률 50%, 실제 진척률 25% -> delayGap 25%p (15~29% 범위), status WARNING', () => {
    const res = getNodeDelayInfo(
      {
        startAt: '2026-08-01',
        endAt: '2026-08-11',
        progress: 25,
      },
      '2026-08-06',
    );
    expect(res.delayGap).toBe(25);
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

  describe('단기 일정(영업일 1~3일) 지연 상태 특수 정책', () => {
    // 2026-08-03(월) ~ 2026-08-05(수): 총 2영업일 일정 [8/3, 8/4]
    const shortNode = {
      startAt: '2026-08-03',
      endAt: '2026-08-05',
      progress: 0,
    };

    it('진행 중(오늘 < endAt)일 때는 진척률이 0%여도 ON_TRACK 유지', () => {
      // 8/4(화): expected 50%, actual 0% -> delayGap 50%p지만 단기 일정 진행 중이므로 ON_TRACK
      const res = getNodeDelayInfo(shortNode, '2026-08-04');
      expect(res.expectedProgress).toBe(50);
      expect(res.actualProgress).toBe(0);
      expect(res.delayGap).toBe(50);
      expect(res.status).toBe('ON_TRACK');
    });

    it('종료일 당일(오늘 === endAt)에 미완료 시 WARNING 경고', () => {
      // 8/5(수): 오늘이 종료일 당일, actual 0% 미완료 -> WARNING
      const res = getNodeDelayInfo(shortNode, '2026-08-05');
      expect(res.expectedProgress).toBe(100);
      expect(res.actualProgress).toBe(0);
      expect(res.status).toBe('WARNING');
    });

    it('종료일 도과(오늘 > endAt) 시 미완료된 경우 CRITICAL 경고', () => {
      // 8/6(목): 종료일 지난 시점, actual 50% 미완료 -> CRITICAL
      const res = getNodeDelayInfo({ ...shortNode, progress: 50 }, '2026-08-06');
      expect(res.expectedProgress).toBe(100);
      expect(res.actualProgress).toBe(50);
      expect(res.status).toBe('CRITICAL');
    });

    it('종료일 도과 시에도 진척률 100% 완료 상태라면 ON_TRACK', () => {
      const res = getNodeDelayInfo({ ...shortNode, progress: 100 }, '2026-08-06');
      expect(res.status).toBe('ON_TRACK');
    });
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
      { id: 'item2', kind: 'ITEM', parentId: 'group1', startAt: '2026-08-03', endAt: '2026-08-07', progress: 0 }, // expected 50% -> gap 50%p -> CRITICAL
    ];
    const map = calculateTreeNodesDelayInfo(nodes, '2026-08-05');
    const groupInfo = map.get('group1')!;
    expect(groupInfo.status).toBe('CRITICAL');
  });

  // ── 분모 불일치 회귀 ──
  // 예전 버블업은 예상 진척률을 "날짜 있는 ITEM" 으로 평균 내면서, 실제 진척률은
  // progressEffective(=날짜 유무 무관 전체 평균)를 썼다. 그래서 날짜 미기입 항목이
  // 하나만 있어도 실제가 끌어내려져 없는 지연이 만들어졌고, 같은 상황에서 프로젝트
  // 요약은 다른 값을 냈다. 두 경로가 같은 답을 내는지 고정한다.
  it('날짜 없는 ITEM 은 예상/실제 양쪽 분모에서 함께 빠진다', () => {
    const nodes = [
      { id: 'g', kind: 'GROUP', parentId: null, progressEffective: 10 }, // (20+0)/2 = 10
      { id: 'dated', kind: 'ITEM', parentId: 'g', startAt: '2026-08-01', endAt: '2026-08-31', progress: 20 },
      { id: 'undated', kind: 'ITEM', parentId: 'g', startAt: null, endAt: null, progress: 0 },
    ];
    const info = calculateTreeNodesDelayInfo(nodes, '2026-08-08').get('g')!;

    // 판단 가능한 항목은 dated 하나뿐 → 예상도 실제도 그 항목만으로 낸다.
    expect(info.actualProgress).toBe(20); // 예전엔 progressEffective 인 10 이었다
    expect(info.delayGap).toBe(info.expectedProgress! - 20);
  });

  it('같은 트리에서 그룹 버블업과 프로젝트 요약이 같은 gap 을 낸다', () => {
    const nodes = [
      { id: 'g', kind: 'GROUP', parentId: null, progressEffective: 10 },
      { id: 'dated', kind: 'ITEM', parentId: 'g', startAt: '2026-08-01', endAt: '2026-08-31', progress: 20 },
      { id: 'undated', kind: 'ITEM', parentId: 'g', startAt: null, endAt: null, progress: 0 },
    ];
    const group = calculateTreeNodesDelayInfo(nodes, '2026-08-08').get('g')!;
    const summary = calculateProjectDelaySummary(nodes, '2026-08-08');

    expect(group.expectedProgress).toBe(summary.avgExpectedProgress);
    expect(group.actualProgress).toBe(summary.avgActualProgress);
    expect(group.delayGap).toBe(summary.avgDelayGap);
    expect(group.status).toBe(summary.status);
  });

  it('자손 ITEM 이 모두 날짜 미기입이면 판단하지 않는다 (UNKNOWN)', () => {
    const nodes = [
      { id: 'g', kind: 'GROUP', parentId: null, progressEffective: 0 },
      { id: 'i', kind: 'ITEM', parentId: 'g', startAt: null, endAt: null, progress: 0 },
    ];
    expect(calculateTreeNodesDelayInfo(nodes, '2026-08-08').get('g')!.status).toBe('UNKNOWN');
  });

  it('손자 항목이 중간 그룹 수에 따라 가중되지 않는다 (평균의 평균 방지)', () => {
    // gA 아래 항목 1개(0%), gB 아래 항목 3개(100%) → 전체 평균은 75% 여야 한다.
    // 자식 그룹의 평균을 다시 평균 내면 50% 가 나온다.
    const nodes = [
      { id: 'root', kind: 'GROUP', parentId: null },
      { id: 'gA', kind: 'GROUP', parentId: 'root' },
      { id: 'gB', kind: 'GROUP', parentId: 'root' },
      { id: 'a1', kind: 'ITEM', parentId: 'gA', startAt: '2026-08-01', endAt: '2026-08-31', progress: 0 },
      { id: 'b1', kind: 'ITEM', parentId: 'gB', startAt: '2026-08-01', endAt: '2026-08-31', progress: 100 },
      { id: 'b2', kind: 'ITEM', parentId: 'gB', startAt: '2026-08-01', endAt: '2026-08-31', progress: 100 },
      { id: 'b3', kind: 'ITEM', parentId: 'gB', startAt: '2026-08-01', endAt: '2026-08-31', progress: 100 },
    ];
    expect(calculateTreeNodesDelayInfo(nodes, '2026-08-08').get('root')!.actualProgress).toBe(75);
  });

  it('부모가 목록에 없는 노드도 배지가 비지 않는다', () => {
    const nodes = [
      { id: 'orphan', kind: 'ITEM', parentId: 'gone', startAt: '2026-08-01', endAt: '2026-08-31', progress: 50 },
    ];
    expect(calculateTreeNodesDelayInfo(nodes, '2026-08-08').has('orphan')).toBe(true);
  });

  it('노드가 많아도 선형 시간에 끝난다 (예전 O(N²) 회귀)', () => {
    // 깊이 10 짜리 사슬을 여러 개 — 예전 구현은 그룹마다 서브트리를 다시 훑었다.
    const nodes: Record<string, unknown>[] = [];
    for (let chain = 0; chain < 300; chain += 1) {
      let parentId: string | null = null;
      for (let d = 0; d < 9; d += 1) {
        const id = `g${chain}_${d}`;
        nodes.push({ id, kind: 'GROUP', parentId });
        parentId = id;
      }
      nodes.push({
        id: `i${chain}`, kind: 'ITEM', parentId,
        startAt: '2026-08-01', endAt: '2026-08-31', progress: 50,
      });
    }
    const started = Date.now();
    const map = calculateTreeNodesDelayInfo(nodes as never[], '2026-08-08');
    expect(map.size).toBe(nodes.length);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('calculateProjectDelaySummary', () => {
  it('여러 노드의 진척 현황을 종합 집계한다', () => {
    const nodes = [
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 10 }, // expected 50, gap 40 -> CRITICAL
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 50 }, // expected 50, gap 0 -> ON_TRACK
      { kind: 'ITEM', startAt: '2026-08-01', endAt: '2026-08-11', progress: 30 }, // expected 50, gap 20 -> WARNING
    ];
    const summary = calculateProjectDelaySummary(nodes, '2026-08-06');
    expect(summary.totalNodes).toBe(3);
    expect(summary.validNodes).toBe(3);
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.onTrackCount).toBe(1);
    expect(summary.avgExpectedProgress).toBe(50);
    expect(summary.avgActualProgress).toBe(30);
    expect(summary.avgDelayGap).toBe(20);
    expect(summary.status).toBe('CRITICAL');
  });
});
