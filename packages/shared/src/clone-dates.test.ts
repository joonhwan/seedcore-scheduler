import { describe, expect, it } from 'vitest';
import {
  buildRemapPlan,
  findDateSpan,
  fromEpochDay,
  remapDatePair,
  toEpochDay,
} from './clone-dates';

describe('epoch-day 변환', () => {
  it('YYYY-MM-DD 를 왕복 변환해도 값이 유지된다', () => {
    for (const d of ['2026-01-01', '2026-02-28', '2026-12-31', '2024-02-29']) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });

  it('하루 차이는 1 이다', () => {
    expect(toEpochDay('2026-03-02') - toEpochDay('2026-03-01')).toBe(1);
  });

  it('2026 년은 윤년이 아니라 2 월이 28 일이다', () => {
    expect(toEpochDay('2026-03-01') - toEpochDay('2026-02-01')).toBe(28);
  });

  it('두 자리 연도가 1900년대로 밀리지 않고 그대로 왕복된다', () => {
    expect(fromEpochDay(toEpochDay('0050-01-01'))).toBe('0050-01-01');
    expect(fromEpochDay(toEpochDay('0099-12-31'))).toBe('0099-12-31');
  });

  it('두 자리 연도에서도 하루 차이는 1 이다', () => {
    expect(toEpochDay('0050-01-02') - toEpochDay('0050-01-01')).toBe(1);
  });
});

describe('findDateSpan', () => {
  it('날짜가 하나도 없으면 null 이다', () => {
    expect(findDateSpan([{ startAt: null, endAt: null }])).toBeNull();
    expect(findDateSpan([])).toBeNull();
  });

  it('startAt 만 있는 항목에서도 span 을 만든다', () => {
    expect(findDateSpan([{ startAt: '2026-05-01', endAt: null }])).toEqual({
      start: '2026-05-01',
      end: '2026-05-01',
    });
  });

  it('여러 항목의 최소 시작일과 최대 종료일을 찾는다', () => {
    const span = findDateSpan([
      { startAt: '2026-03-10', endAt: '2026-03-20' },
      { startAt: '2026-01-05', endAt: '2026-02-01' },
      { startAt: null, endAt: '2026-06-30' },
    ]);
    expect(span).toEqual({ start: '2026-01-05', end: '2026-06-30' });
  });
});

describe('KEEP 모드', () => {
  it('날짜를 그대로 둔다', () => {
    const plan = buildRemapPlan({ start: '2026-01-05', end: '2026-06-30' }, { mode: 'KEEP' });
    expect(remapDatePair({ startAt: '2026-02-10', endAt: '2026-02-20' }, plan)).toEqual({
      startAt: '2026-02-10',
      endAt: '2026-02-20',
    });
  });

  it('span 이 null 이어도 계획을 만들 수 있다', () => {
    expect(buildRemapPlan(null, { mode: 'KEEP' })).toEqual({ mode: 'KEEP' });
  });
});

describe('SHIFT 모드 — 기간과 간격이 완전히 보존된다', () => {
  const span = { start: '2026-01-05', end: '2026-06-30' };
  // 2026-01-05 → 2026-03-05 는 59 일 (1월 잔여 26 + 2월 28 + 3월 5)
  const plan = buildRemapPlan(span, { mode: 'SHIFT', newStartDate: '2026-03-05' });

  it('delta 는 새 시작일과 원본 최소 시작일의 차이다', () => {
    expect(plan).toEqual({ mode: 'SHIFT', deltaDays: 59 });
  });

  it('모든 날짜가 같은 일수만큼 밀린다', () => {
    expect(remapDatePair({ startAt: '2026-02-10', endAt: '2026-02-20' }, plan)).toEqual({
      startAt: '2026-04-10',
      endAt: '2026-04-20',
    });
  });

  it('기간이 변하지 않는다', () => {
    const out = remapDatePair({ startAt: '2026-01-05', endAt: '2026-01-19' }, plan);
    expect(toEpochDay(out.endAt!) - toEpochDay(out.startAt!)).toBe(14);
  });

  it('원본 시작일은 정확히 새 시작일이 된다', () => {
    expect(remapDatePair({ startAt: '2026-01-05', endAt: null }, plan).startAt).toBe('2026-03-05');
  });

  it('과거로 미는 음수 delta 도 동작한다', () => {
    const back = buildRemapPlan(span, { mode: 'SHIFT', newStartDate: '2025-12-06' });
    expect(back).toEqual({ mode: 'SHIFT', deltaDays: -30 });
    expect(remapDatePair({ startAt: '2026-01-05', endAt: null }, back).startAt).toBe('2025-12-06');
  });
});

describe('FIT 모드 — 기간까지 비례해서 늘어난다', () => {
  // 원본 span 180 일 (2026-01-01 ~ 2026-06-30), 새 span 364 일 (2026-01-01 ~ 2026-12-31)
  const plan = buildRemapPlan(
    { start: '2026-01-01', end: '2026-06-30' },
    { mode: 'FIT', newStartDate: '2026-01-01', newEndDate: '2026-12-31' },
  );

  it('계획에 원본과 대상 span 이 epoch-day 로 담긴다', () => {
    expect(plan).toEqual({
      mode: 'FIT',
      srcStart: toEpochDay('2026-01-01'),
      srcEnd: toEpochDay('2026-06-30'),
      dstStart: toEpochDay('2026-01-01'),
      dstEnd: toEpochDay('2026-12-31'),
    });
  });

  it('14 일 작업이 약 2 배인 28 일이 된다', () => {
    // round(14 * 364 / 180) = round(28.31) = 28
    const out = remapDatePair({ startAt: '2026-01-01', endAt: '2026-01-15' }, plan);
    expect(out).toEqual({ startAt: '2026-01-01', endAt: '2026-01-29' });
  });

  it('원본 span 의 양 끝이 새 span 의 양 끝으로 정확히 간다', () => {
    expect(remapDatePair({ startAt: '2026-01-01', endAt: '2026-06-30' }, plan)).toEqual({
      startAt: '2026-01-01',
      endAt: '2026-12-31',
    });
  });

  it('중간 지점이 중간으로 간다', () => {
    // (2026-04-01 - 2026-01-01) = 90 일. round(90 * 364 / 180) = 182
    expect(remapDatePair({ startAt: '2026-04-01', endAt: null }, plan).startAt).toBe(
      fromEpochDay(toEpochDay('2026-01-01') + 182),
    );
  });

  it('범위를 좁히면 기간도 줄어든다', () => {
    // 원본 180 일 → 새 90 일. 20 일 작업은 round(20 * 90 / 180) = 10 일
    const shrink = buildRemapPlan(
      { start: '2026-01-01', end: '2026-06-30' },
      { mode: 'FIT', newStartDate: '2026-01-01', newEndDate: '2026-04-01' },
    );
    const out = remapDatePair({ startAt: '2026-01-01', endAt: '2026-01-21' }, shrink);
    expect(toEpochDay(out.endAt!) - toEpochDay(out.startAt!)).toBe(10);
  });
});

describe('FIT 엣지 케이스', () => {
  it('원본 span 이 0 일이면 0 으로 나누지 않고 모두 새 시작일로 간다', () => {
    const plan = buildRemapPlan(
      { start: '2026-01-10', end: '2026-01-10' },
      { mode: 'FIT', newStartDate: '2026-05-01', newEndDate: '2026-08-01' },
    );
    expect(remapDatePair({ startAt: '2026-01-10', endAt: '2026-01-10' }, plan)).toEqual({
      startAt: '2026-05-01',
      endAt: '2026-05-01',
    });
  });

  it('원본 span 을 벗어난 날짜는 새 범위로 clamp 된다', () => {
    const plan = buildRemapPlan(
      { start: '2026-01-01', end: '2026-01-11' },
      { mode: 'FIT', newStartDate: '2026-03-01', newEndDate: '2026-03-11' },
    );
    // 원본 span 밖(2026-02-01)은 위쪽 경계로 잘린다
    expect(remapDatePair({ startAt: '2026-02-01', endAt: null }, plan).startAt).toBe('2026-03-11');
    // 아래쪽도 마찬가지
    expect(remapDatePair({ startAt: '2025-12-01', endAt: null }, plan).startAt).toBe('2026-03-01');
  });
});

describe('날짜쌍 보정', () => {
  const plan = buildRemapPlan(
    { start: '2026-01-01', end: '2026-01-11' },
    { mode: 'FIT', newStartDate: '2026-03-01', newEndDate: '2026-03-03' },
  );

  it('사상 후 endAt 이 startAt 보다 앞서면 startAt 으로 맞춘다', () => {
    // clamp 로 뒤집힐 수 있는 조합을 만든다
    const out = remapDatePair({ startAt: '2026-01-11', endAt: '2026-01-01' }, plan);
    expect(out.endAt).toBe(out.startAt);
  });

  it('null 은 null 로 유지된다', () => {
    expect(remapDatePair({ startAt: null, endAt: null }, plan)).toEqual({
      startAt: null,
      endAt: null,
    });
    expect(remapDatePair({ startAt: null, endAt: '2026-01-05' }, plan).startAt).toBeNull();
  });
});

describe('buildRemapPlan 방어', () => {
  it('span 이 null 인데 SHIFT 면 NO_DATED_ITEMS 로 던진다', () => {
    expect(() => buildRemapPlan(null, { mode: 'SHIFT', newStartDate: '2026-01-01' })).toThrow(
      'NO_DATED_ITEMS',
    );
  });

  it('SHIFT 인데 newStartDate 가 없으면 던진다', () => {
    expect(() => buildRemapPlan({ start: '2026-01-01', end: '2026-02-01' }, { mode: 'SHIFT' })).toThrow(
      'NEW_START_DATE_REQUIRED',
    );
  });

  it('FIT 인데 newEndDate 가 없으면 던진다', () => {
    expect(() =>
      buildRemapPlan(
        { start: '2026-01-01', end: '2026-02-01' },
        { mode: 'FIT', newStartDate: '2026-03-01' },
      ),
    ).toThrow('NEW_END_DATE_REQUIRED');
  });
});
