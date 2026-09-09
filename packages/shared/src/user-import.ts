/**
 * 조직도 텍스트를 그룹 경로와 사용자 목록으로 바꾸는 순수 파서.
 *
 * 데이터베이스도 HTTP 도 모른다. "이미 있는 아이디인가" 같은 판단은 서버가 하고, 여기서는
 * 파일 내용만으로 알 수 있는 것만 본다. 그래서 이 파일은 브라우저와 서버 양쪽에서 같은
 * 결과를 낸다.
 *
 * 들여쓰기 폭을 2칸이나 4칸으로 고정하지 않고 **직전 줄과의 상대적 깊이**로 판정한다.
 * 손으로 쓴 파일에서 폭이 어긋나는 일이 흔한데, 폭을 고정하면 3칸으로 쓴 파일이 통째로
 * 거부된다. 대신 어느 단계와도 맞지 않는 어중간한 들여쓰기는 BAD_INDENT 로 잡아, 사람이
 * 의도한 계층과 다르게 해석되는 일을 막는다.
 */
import { z } from 'zod';
import { MAX_GROUP_DEPTH } from './user-groups';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, isValidUsername } from './username';

/** 탭 하나를 공백 몇 칸으로 볼지. */
const TAB_WIDTH = 4;
const MAX_GROUP_NAME_LENGTH = 64;
const MAX_DISPLAY_NAME_LENGTH = 128;

export const BulkImportIssueCode = z.enum([
  'EMPTY_FILE',
  'BAD_INDENT',
  'BAD_USER_LINE',
  'INVALID_USERNAME',
  'DUPLICATE_USERNAME_IN_FILE',
  'DUPLICATE_GROUP_IN_FILE',
  'NAME_TOO_LONG',
  'GROUP_DEPTH_EXCEEDED',
]);
export type BulkImportIssueCode = z.infer<typeof BulkImportIssueCode>;

export const BulkImportIssue = z.object({
  /** 1부터 세는 원본 줄 번호. 파일 전체에 대한 오류는 0 이다. */
  line: z.number().int(),
  code: BulkImportIssueCode,
  message: z.string(),
});
export type BulkImportIssue = z.infer<typeof BulkImportIssue>;

export interface ParsedImportUser {
  line: number;
  username: string;
  displayName: string;
  /** 최상위부터의 소속 경로. 빈 배열이면 소속 없음. */
  groupPath: string[];
}

export interface ParsedImport {
  /** 최상위부터의 그룹 경로. 부모가 자식보다 반드시 먼저 온다. */
  groups: string[][];
  users: ParsedImportUser[];
  issues: BulkImportIssue[];
}

/**
 * 그룹 경로를 Map 의 키로 쓸 문자열로 바꾼다.
 *
 * 구분자로 널 문자를 쓰는 이유는 그룹 이름에 들어갈 수 없는 유일한 문자이기 때문이다.
 * '/' 를 쓰면 이름에 '/' 가 든 그룹끼리 키가 겹친다.
 */
export function groupPathKey(path: string[]): string {
  return path.join('\u0000');
}

/** 들여쓰기에 섞이면 안 되는 공백. 한글 문서에서 실수로 들어오기 쉬운 전각 공백이다. */
const FULL_WIDTH_SPACE = '\u3000';

/**
 * 들여쓰기 폭. 알아볼 수 없는 공백을 만나면 `null` 을 돌려준다.
 *
 * 전각 공백을 몇 칸으로 볼지 짐작해서 넘기면 안 된다. 폭을 임의로 정하면 사람이 보는 모양과
 * 프로그램이 읽는 계층이 어긋난 채로 조용히 통과한다. 잡아서 알려 주는 편이 낫다.
 */
function indentWidthOf(raw: string): number | null {
  let width = 0;
  for (const ch of raw) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH;
    else if (ch === FULL_WIDTH_SPACE) return null;
    else break;
  }
  return width;
}

export function parseUserImport(text: string): ParsedImport {
  const issues: BulkImportIssue[] = [];
  const groups: string[][] = [];
  const users: ParsedImportUser[] = [];

  /** widths[i] 는 i 단계의 들여쓰기 폭이다. */
  const widths: number[] = [];
  /** path[i] 는 i 단계의 그룹 이름이다. 사용자 줄은 여기에 쌓이지 않는다. */
  const path: string[] = [];
  /**
   * 가장 최근 사용자 줄의 단계. `path` 는 사용자 줄에서 잘리지 않으므로, 앞선 가지의
   * 그룹 이름이 남아 있으면 사용자 줄 아래에 들여 쓴 그룹이 그 이름의 하위로 잘못 붙는다.
   * 이 값으로 "사용자 줄보다 깊게 들여 썼는가"를 따로 판정한다.
   */
  let lastUserLevel: number | null = null;

  const seenUsernames = new Set<string>();
  const seenGroupKeys = new Set<string>();
  let contentLineCount = 0;

  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const line = i + 1;
    const raw = rawLines[i] ?? '';
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    contentLineCount += 1;

    // ── 단계 판정 ──────────────────────────────────────────────────────
    const width = indentWidthOf(raw);
    if (width === null) {
      issues.push({
        line,
        code: 'BAD_INDENT',
        message: '들여쓰기에 전각 공백이 섞여 있습니다. 탭이나 일반 공백을 쓰십시오.',
      });
      continue;
    }
    let level: number;
    if (widths.length === 0) {
      // 첫 줄의 폭이 무엇이든 그것을 0단계의 기준으로 삼는다. 파일 전체가 들여쓰여
      // 있어도 통과시키기 위함이다.
      widths.push(width);
      level = 0;
    } else if (width > widths[widths.length - 1]!) {
      widths.push(width);
      level = widths.length - 1;
    } else {
      const found = widths.lastIndexOf(width);
      if (found === -1) {
        issues.push({
          line,
          code: 'BAD_INDENT',
          message: '들여쓰기가 어느 단계와도 맞지 않습니다.',
        });
        continue;
      }
      widths.length = found + 1;
      level = found;
    }

    // 가장 최근 사용자 줄보다 깊게 들여 썼다면, path 에 남아 있는 앞선 그룹 이름 때문에
    // 아래의 path[level - 1] 가드를 그냥 지나칠 수 있다. 여기서 먼저 잡는다.
    if (lastUserLevel !== null && level > lastUserLevel) {
      issues.push({
        line,
        code: 'BAD_INDENT',
        message: '상위 그룹이 없는 자리입니다. 사용자 줄 아래에는 아무것도 넣을 수 없습니다.',
      });
      widths.length = level;
      continue;
    } else if (lastUserLevel !== null && level <= lastUserLevel) {
      // 형제이거나 더 얕은 줄이므로 사용자 줄의 영향권을 벗어났다.
      lastUserLevel = null;
    }

    // 자기보다 한 단계 얕은 자리에 그룹이 있어야 한다. 사용자 줄 아래에 무언가를 들여 쓴
    // 경우가 여기에 걸린다.
    if (level > 0 && path[level - 1] === undefined) {
      issues.push({
        line,
        code: 'BAD_INDENT',
        message: '상위 그룹이 없는 자리입니다. 사용자 줄 아래에는 아무것도 넣을 수 없습니다.',
      });
      // 이 줄이 만든 단계를 되돌린다. 그대로 두면 뒤따르는 줄이 같은 오류를 연달아 낸다.
      widths.length = level;
      continue;
    }

    if (trimmed.startsWith('-')) {
      // ── 사용자 줄 ────────────────────────────────────────────────────
      const rest = trimmed.slice(1).trim();
      const comma = rest.indexOf(',');
      if (comma === -1) {
        issues.push({
          line,
          code: 'BAD_USER_LINE',
          message: '`- 아이디, 이름` 형태로 적어야 합니다.',
        });
        continue;
      }
      const username = rest.slice(0, comma).trim();
      const displayName = rest.slice(comma + 1).trim();
      if (displayName.length === 0) {
        issues.push({ line, code: 'BAD_USER_LINE', message: '이름이 비어 있습니다.' });
        continue;
      }
      if (!isValidUsername(username)) {
        issues.push({
          line,
          code: 'INVALID_USERNAME',
          message: `아이디 "${username}" 는 영문·숫자와 . _ - 만 ${USERNAME_MIN_LENGTH}~${USERNAME_MAX_LENGTH}자로 쓸 수 있습니다.`,
        });
        continue;
      }
      if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        issues.push({
          line,
          code: 'NAME_TOO_LONG',
          message: `이름은 ${MAX_DISPLAY_NAME_LENGTH}자를 넘을 수 없습니다.`,
        });
        continue;
      }
      if (seenUsernames.has(username)) {
        issues.push({
          line,
          code: 'DUPLICATE_USERNAME_IN_FILE',
          message: `아이디 "${username}" 가 파일 안에서 두 번 나옵니다.`,
        });
        continue;
      }
      seenUsernames.add(username);
      users.push({ line, username, displayName, groupPath: path.slice(0, level) });
      lastUserLevel = level;
    } else {
      // ── 그룹 줄 ──────────────────────────────────────────────────────
      const name = trimmed;
      if (name.length > MAX_GROUP_NAME_LENGTH) {
        issues.push({
          line,
          code: 'NAME_TOO_LONG',
          message: `그룹 이름은 ${MAX_GROUP_NAME_LENGTH}자를 넘을 수 없습니다.`,
        });
        widths.length = level;
        continue;
      }
      if (level + 1 > MAX_GROUP_DEPTH) {
        issues.push({
          line,
          code: 'GROUP_DEPTH_EXCEEDED',
          message: `조직 계층은 ${MAX_GROUP_DEPTH}단계까지만 만들 수 있습니다.`,
        });
        widths.length = level;
        continue;
      }
      const fullPath = [...path.slice(0, level), name];
      const key = groupPathKey(fullPath);
      if (seenGroupKeys.has(key)) {
        issues.push({
          line,
          code: 'DUPLICATE_GROUP_IN_FILE',
          message: `같은 상위 그룹 아래에 "${name}" 가 두 번 나옵니다.`,
        });
        widths.length = level;
        continue;
      }
      seenGroupKeys.add(key);
      path.length = level;
      path.push(name);
      groups.push(fullPath);
    }
  }

  if (contentLineCount === 0) {
    issues.push({ line: 0, code: 'EMPTY_FILE', message: '등록할 내용이 없습니다.' });
  }

  return { groups, users, issues };
}
