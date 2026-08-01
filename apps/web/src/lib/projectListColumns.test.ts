import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COLUMN_WIDTHS,
  FLEX_COLUMN,
  computeRenderedWidths,
  type ProjectColumnKey,
} from './projectListColumns';

/** 관리자 모드일 때 보이는 모든 컬럼의 기본 폭 합계 */
const FULL_SUM = (Object.keys(DEFAULT_COLUMN_WIDTHS) as ProjectColumnKey[]).reduce(
  (acc, k) => acc + DEFAULT_COLUMN_WIDTHS[k],
  0,
);

/** 관리자 모드가 아닐 때의 합계 (manage 제외) */
const BASE_SUM = FULL_SUM - DEFAULT_COLUMN_WIDTHS.manage;

describe('computeRenderedWidths', () => {
  it('컨테이너가 합계보다 넓으면 남는 폭을 설명 컬럼이 흡수한다', () => {
    const container = FULL_SUM + 300;
    const { widths, tableWidth } = computeRenderedWidths({}, container, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 300);
    expect(tableWidth).toBe(container);
  });

  it('설명 말고 다른 컬럼은 건드리지 않는다', () => {
    const { widths } = computeRenderedWidths({}, FULL_SUM + 300, true);

    expect(widths.name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
    expect(widths.manage).toBe(DEFAULT_COLUMN_WIDTHS.manage);
  });

  it('컨테이너가 합계보다 좁으면 아무것도 늘리지 않는다 (가로 스크롤)', () => {
    const { widths, tableWidth } = computeRenderedWidths({}, 400, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN]);
    expect(tableWidth).toBe(FULL_SUM);
  });

  it('컨테이너 폭이 0 이면 (측정 전) 합계를 그대로 돌려준다', () => {
    const { widths, tableWidth } = computeRenderedWidths({}, 0, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN]);
    expect(tableWidth).toBe(FULL_SUM);
  });

  it('관리자 모드가 아니면 manage 를 합계에서 뺀다', () => {
    const { tableWidth } = computeRenderedWidths({}, 0, false);

    expect(tableWidth).toBe(BASE_SUM);
  });

  it('관리자 모드가 아닐 때도 남는 폭 계산은 manage 를 뺀 합계 기준이다', () => {
    const container = BASE_SUM + 120;
    const { widths, tableWidth } = computeRenderedWidths({}, container, false);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 120);
    expect(tableWidth).toBe(container);
  });

  it('저장된 폭이 있으면 그것을 쓴다', () => {
    const { widths } = computeRenderedWidths({ name: 500 }, 0, true);

    expect(widths.name).toBe(500);
  });

  it('저장값에 없는 키는 기본값으로 메운다', () => {
    const { widths } = computeRenderedWidths({ name: 500 }, 0, true);

    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
  });

  it('저장값이 0 이하거나 숫자가 아니면 기본값으로 되돌린다', () => {
    const { widths } = computeRenderedWidths(
      { name: 0, status: -50, myRole: NaN },
      0,
      true,
    );

    expect(widths.name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    expect(widths.status).toBe(DEFAULT_COLUMN_WIDTHS.status);
    expect(widths.myRole).toBe(DEFAULT_COLUMN_WIDTHS.myRole);
  });

  it('저장값이 반영된 뒤의 합계를 기준으로 남는 폭을 계산한다', () => {
    // name 을 240 → 340 으로 넓히면 합계가 100 늘어난다
    const stored = { name: DEFAULT_COLUMN_WIDTHS.name + 100 };
    const container = FULL_SUM + 300;
    const { widths, tableWidth } = computeRenderedWidths(stored, container, true);

    expect(widths[FLEX_COLUMN]).toBe(DEFAULT_COLUMN_WIDTHS[FLEX_COLUMN] + 200);
    expect(tableWidth).toBe(container);
  });

  it('관리자 모드와 아닌 모드의 tableWidth 차이는 정확히 manage 컬럼 폭이다', () => {
    // container 를 0 으로 둬서 (측정 전) 남는 폭 흡수가 끼어들지 않게 한다.
    // 그래야 두 모드의 tableWidth 차이가 오롯이 manage 컬럼 포함 여부만 반영한다.
    const admin = computeRenderedWidths({}, 0, true);
    const nonAdmin = computeRenderedWidths({}, 0, false);

    expect(admin.tableWidth - nonAdmin.tableWidth).toBe(DEFAULT_COLUMN_WIDTHS.manage);
  });
});
