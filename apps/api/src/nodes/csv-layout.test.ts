import { describe, it, expect } from 'vitest';
import { detectCsvLayout } from './csv-layout';

/** 웹의 handleExportCsv 가 만드는 헤더 (일정1..일정10 + 시작일/종료일/진척율). */
const EXPORT_HEADER = [
  '일정1', '일정2', '일정3', '일정4', '일정5',
  '일정6', '일정7', '일정8', '일정9', '일정10',
  '시작일', '종료일', '진척율',
];

/** 내보내기 한 줄을 흉내낸다: depth 칸에 제목, 뒤에 날짜/진척율. */
function exportRow(depth: number, title: string, start = '', end = '', progress = ''): string[] {
  const line = Array.from({ length: 13 }, () => '');
  line[depth] = title;
  line[10] = start;
  line[11] = end;
  line[12] = progress;
  return line;
}

describe('detectCsvLayout — 헤더 우선', () => {
  it('내보내기 형식을 그대로 되읽는다 (왕복)', () => {
    const rows = [
      EXPORT_HEADER,
      exportRow(0, '대분류'),
      exportRow(1, '중분류'),
      exportRow(2, '작업 A', '2026-01-01', '2026-01-31', '50%'),
    ];
    const layout = detectCsvLayout(rows);
    expect(layout.source).toBe('header');
    expect(layout.startDateColIdx).toBe(10);
    expect(layout.endDateColIdx).toBe(11);
    expect(layout.progressColIdx).toBe(12);
    expect(layout.maxDepth).toBe(10);
  });

  it('헤더 행의 위치를 알려준다 — 이 행이 "일정1" 노드로 둔갑하던 버그의 방지책', () => {
    const layout = detectCsvLayout([EXPORT_HEADER, exportRow(0, '대분류')]);
    expect(layout.headerRowIndex).toBe(0);
  });

  it('날짜가 든 행이 하나도 없어도 헤더만 있으면 정확하다 (추론이 못 하던 경우)', () => {
    const rows = [EXPORT_HEADER, exportRow(0, '대분류'), exportRow(1, '중분류')];
    const layout = detectCsvLayout(rows);
    expect(layout.source).toBe('header');
    expect(layout.startDateColIdx).toBe(10);
  });

  it('날짜가 든 행이 딱 1줄이어도 헤더가 이긴다 (추론이 기본값 5/6/7 로 무너지던 경우)', () => {
    const rows = [EXPORT_HEADER, exportRow(0, '작업', '2026-03-02', '2026-03-05', '10%')];
    const layout = detectCsvLayout(rows);
    expect(layout.source).toBe('header');
    expect(layout.startDateColIdx).toBe(10);
    expect(layout.endDateColIdx).toBe(11);
  });

  it('트리 열 수가 다른 형식도 헤더대로 따른다', () => {
    const rows = [['대분류', '중분류', '시작일', '종료일', '진척율']];
    const layout = detectCsvLayout(rows);
    expect(layout.startDateColIdx).toBe(2);
    expect(layout.maxDepth).toBe(2);
  });

  it('진척율 열이 없으면 종료일 다음 칸을 쓴다', () => {
    const layout = detectCsvLayout([['일정1', '일정2', '시작일', '종료일']]);
    expect(layout.endDateColIdx).toBe(3);
    expect(layout.progressColIdx).toBe(4); // 종료일(3) 다음
  });

  it('표기 흔들림을 흡수한다 (공백/한자어/영문)', () => {
    expect(detectCsvLayout([['a', '시작 일', '종료 일', '진행률']]).startDateColIdx).toBe(1);
    expect(detectCsvLayout([['a', '시작일자', '종료일자', '진척률']]).startDateColIdx).toBe(1);
    expect(detectCsvLayout([['a', 'Start', 'End', 'Progress']]).startDateColIdx).toBe(1);
  });

  it('트리 열 없이 시작일이 0번이면 헤더로 보지 않는다', () => {
    const layout = detectCsvLayout([['시작일', '종료일']]);
    expect(layout.source).not.toBe('header');
  });

  it('종료일이 시작일보다 앞에 있으면 헤더로 보지 않는다', () => {
    const layout = detectCsvLayout([['일정1', '종료일', '시작일']]);
    expect(layout.source).not.toBe('header');
  });

  it('데이터 한복판(6번째 행 이후)의 "시작일" 은 헤더로 오인하지 않는다', () => {
    const rows = [
      exportRow(0, 'a', '2026-01-01', '2026-01-02'),
      exportRow(0, 'b', '2026-01-01', '2026-01-02'),
      exportRow(0, 'c', '2026-01-01', '2026-01-02'),
      exportRow(0, 'd', '2026-01-01', '2026-01-02'),
      exportRow(0, 'e', '2026-01-01', '2026-01-02'),
      ['메모', '시작일 기준', '종료일 기준', ''],
    ];
    expect(detectCsvLayout(rows).source).toBe('heuristic');
  });
});

describe('detectCsvLayout — 헤더가 없을 때 추론', () => {
  it('날짜꼴이 가장 많은 두 열을 시작/종료로 잡는다', () => {
    const rows = [
      exportRow(0, 'a', '2026-01-01', '2026-01-31'),
      exportRow(1, 'b', '2026-02-01', '2026-02-28'),
    ];
    const layout = detectCsvLayout(rows);
    expect(layout.source).toBe('heuristic');
    expect(layout.startDateColIdx).toBe(10);
    expect(layout.endDateColIdx).toBe(11);
    expect(layout.headerRowIndex).toBeNull();
  });

  it('구분자가 / 나 . 여도 날짜로 인식한다', () => {
    const rows = [
      ['a', '2026/01/01', '2026.01.31'],
      ['b', '2026/02/01', '2026.02.28'],
    ];
    const layout = detectCsvLayout(rows);
    expect(layout.startDateColIdx).toBe(1);
    expect(layout.endDateColIdx).toBe(2);
  });

  it('열 순서가 뒤집혀 등장해도 작은 인덱스를 시작일로 둔다', () => {
    const rows = [['a', '2026-05-01', '2026-01-01']];
    const layout = detectCsvLayout(rows);
    expect(layout.startDateColIdx).toBeLessThan(layout.endDateColIdx);
  });
});

describe('detectCsvLayout — 단서가 전혀 없을 때', () => {
  it('열 수에서 역산한다 (근거 없는 상수 5/6/7 을 쓰지 않는다)', () => {
    const rows = [['대분류', '', '', '', ''], ['', '중분류', '', '', '']];
    const layout = detectCsvLayout(rows);
    expect(layout.source).toBe('default');
    expect(layout.startDateColIdx).toBe(2); // width 5 - 3
    expect(layout.maxDepth).toBe(2);
  });

  it('열이 아주 적어도 깊이 열을 최소 1개는 남긴다', () => {
    const layout = detectCsvLayout([['제목']]);
    expect(layout.maxDepth).toBeGreaterThanOrEqual(1);
    expect(layout.startDateColIdx).toBeGreaterThanOrEqual(1);
  });

  it('빈 입력에서도 터지지 않는다', () => {
    expect(() => detectCsvLayout([])).not.toThrow();
  });
});

describe('detectCsvLayout — maxDepth 상한', () => {
  it('트리 열이 아무리 많아도 MAX_TREE_DEPTH(10) 를 넘지 않는다', () => {
    const wide = [...Array.from({ length: 20 }, (_, i) => `일정${i + 1}`), '시작일', '종료일'];
    expect(detectCsvLayout([wide]).maxDepth).toBe(10);
  });
});
