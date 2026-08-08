import { MAX_TREE_DEPTH } from '@sam/shared';

/**
 * CSV 가져오기의 열 배치 판정.
 *
 * 내보내기(ProjectDetailPage 의 handleExportCsv)가 만드는 형식은 다음과 같다:
 *
 *   일정1,일정2,…,일정10,시작일,종료일,진척율     ← 헤더 행
 *   "대분류","","",…,"","","",""                  ← 이후 데이터 행
 *
 * 즉 앞쪽 N 개가 트리 깊이 열이고 그 뒤에 날짜 2 개와 진척율이 온다. N 은 고정이 아니라
 * (사용자가 엑셀에서 열을 지우고 넣을 수 있으므로) 파일을 보고 알아내야 한다.
 *
 * 판정은 두 단계다.
 *
 *  1) **헤더 행 우선.** "시작일"/"종료일" 이 적힌 행을 찾으면 그 위치를 그대로 믿는다.
 *     이게 없으면 아래 추론으로 넘어간다.
 *  2) **날짜 패턴 추론.** 날짜꼴 값이 가장 많이 등장한 열 두 개를 시작일/종료일로 본다.
 *
 * 헤더를 먼저 보게 만든 이유가 두 가지 있다.
 *
 *  - 추론만 쓰면 **날짜가 든 행이 2줄 미만인 파일에서 조용히 틀린다.** 후보 열이 2개 미만이면
 *    기본값 5/6/7 로 떨어지는데 내보내기 형식은 10/11/12 라, 일정 이름이 든 열을 날짜로 읽고
 *    날짜 열을 이름으로 읽는다. 예외도 경고도 없이 엉뚱한 데이터가 들어간다.
 *  - 헤더 행 자체가 **노드로 둔갑했다.** 가져오기 루프는 깊이 열에서 처음 비지 않은 칸을
 *    제목으로 삼는데, 헤더 행의 첫 칸은 "일정1" 이다. 그래서 내보낸 파일을 그대로 다시
 *    가져오면 "일정1" 이라는 가짜 최상위 노드가 매번 하나씩 생겼다. headerRowIndex 를
 *    돌려주는 것은 호출측이 그 행을 건너뛰게 하기 위해서다.
 */
export interface CsvLayout {
  startDateColIdx: number;
  endDateColIdx: number;
  progressColIdx: number;
  /** 트리 깊이로 쓸 열 개수 (1..MAX_TREE_DEPTH) */
  maxDepth: number;
  /** 헤더로 판정된 행. 노드로 만들면 안 된다. 없으면 null */
  headerRowIndex: number | null;
  /** 어느 근거로 정했는지 — 로그·디버깅용 */
  source: 'header' | 'heuristic' | 'default';
}

/** 헤더 후보로 볼 행의 범위. 데이터 한복판에 "시작일" 이 적힌 행이 있어도 헤더로 오인하지 않는다. */
const HEADER_SCAN_ROWS = 5;

const DATE_PATTERN = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/;

/** 공백·괄호 등을 지워 헤더 표기 흔들림("시작 일", "시작일자")을 흡수한다. */
function normalizeHeader(cell: string): string {
  return cell.replace(/[\s()[\]{}]/g, '').toLowerCase();
}

function isStartHeader(cell: string): boolean {
  const n = normalizeHeader(cell);
  return n === '시작일' || n === '시작일자' || n === '시작' || n === 'startat' || n === 'start';
}

function isEndHeader(cell: string): boolean {
  const n = normalizeHeader(cell);
  return n === '종료일' || n === '종료일자' || n === '종료' || n === 'endat' || n === 'end';
}

function isProgressHeader(cell: string): boolean {
  const n = normalizeHeader(cell);
  return (
    n === '진척율' ||
    n === '진척률' ||
    n === '진행율' ||
    n === '진행률' ||
    n === '진척도' ||
    n === 'progress'
  );
}

export function detectCsvLayout(parsedLines: string[][]): CsvLayout {
  // ── 1) 헤더 행 찾기 ──────────────────────────────────────────────────────
  const scanUpTo = Math.min(HEADER_SCAN_ROWS, parsedLines.length);
  for (let row = 0; row < scanUpTo; row += 1) {
    const cols = parsedLines[row];
    if (!cols) continue;

    const startIdx = cols.findIndex(isStartHeader);
    const endIdx = cols.findIndex(isEndHeader);
    // 둘 다 있고 순서가 맞아야 헤더로 인정한다. 시작일 앞에 트리 열이 최소 하나는 있어야
    // 하므로 startIdx 가 0 이면(=깊이 열이 없으면) 헤더로 보지 않는다.
    if (startIdx < 1 || endIdx <= startIdx) continue;

    const progressIdx = cols.findIndex(isProgressHeader);
    return {
      startDateColIdx: startIdx,
      endDateColIdx: endIdx,
      // 진척율 열이 없는 파일도 있다. 그럴 땐 종료일 다음 칸을 관례대로 쓴다.
      progressColIdx: progressIdx > endIdx ? progressIdx : endIdx + 1,
      maxDepth: clampDepth(startIdx),
      headerRowIndex: row,
      source: 'header',
    };
  }

  // ── 2) 날짜 패턴 추론 ────────────────────────────────────────────────────
  const colMatchCounts: Record<number, number> = {};
  for (const cols of parsedLines) {
    if (!cols) continue;
    cols.forEach((col, idx) => {
      if (DATE_PATTERN.test(col)) {
        colMatchCounts[idx] = (colMatchCounts[idx] ?? 0) + 1;
      }
    });
  }

  const ranked = Object.keys(colMatchCounts)
    .map(Number)
    .sort((a, b) => (colMatchCounts[b] ?? 0) - (colMatchCounts[a] ?? 0));

  if (ranked.length >= 2) {
    const [first, second] = [ranked[0], ranked[1]];
    if (first !== undefined && second !== undefined) {
      const [startIdx, endIdx] = first <= second ? [first, second] : [second, first];
      return {
        startDateColIdx: startIdx,
        endDateColIdx: endIdx,
        progressColIdx: endIdx + 1,
        maxDepth: clampDepth(startIdx),
        headerRowIndex: null,
        source: 'heuristic',
      };
    }
  }

  // ── 3) 아무 단서도 없을 때 ───────────────────────────────────────────────
  // 날짜가 전혀 없는 파일(제목만 있는 트리)도 정상 입력이다. 이때는 어느 열이 날짜인지
  // 알 길이 없으므로 열 개수에서 역산한다 — 마지막 3 개를 시작일/종료일/진척율로 본다.
  // 예전 기본값 5/6/7 은 근거 없는 상수라 열 수가 다르면 그냥 틀렸다.
  const width = parsedLines.reduce((m, cols) => Math.max(m, cols?.length ?? 0), 0);
  const startIdx = Math.max(1, width - 3);
  return {
    startDateColIdx: startIdx,
    endDateColIdx: startIdx + 1,
    progressColIdx: startIdx + 2,
    maxDepth: clampDepth(startIdx),
    headerRowIndex: null,
    source: 'default',
  };
}

function clampDepth(startDateColIdx: number): number {
  return Math.max(1, Math.min(MAX_TREE_DEPTH, startDateColIdx));
}
