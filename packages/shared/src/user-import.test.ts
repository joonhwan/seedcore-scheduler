import { describe, expect, it } from 'vitest';
import { parseUserImport } from './user-import';

describe('parseUserImport() — 정상 트리', () => {
  const text = [
    '# 2026년 조직도',
    '운영기술센터',
    '  기구완성팀',
    '    - gigu01, 김민준-기구완성팀',
    '    - gigu02, 이서연-기구완성팀',
    '  생산기술팀',
    '    - saeng01, 박도윤-생산기술팀',
    '  - center01, 정하준-센터장',
    '',
    '구매팀',
    '  - gumae01, 한지호-구매팀',
    '- ceo01, 최정우-대표이사',
  ].join('\n');

  it('오류 없이 읽는다', () => {
    expect(parseUserImport(text).issues).toEqual([]);
  });

  it('그룹 경로를 부모부터 차례로 모은다', () => {
    expect(parseUserImport(text).groups).toEqual([
      ['운영기술센터'],
      ['운영기술센터', '기구완성팀'],
      ['운영기술센터', '생산기술팀'],
      ['구매팀'],
    ]);
  });

  it('사용자를 자기 바로 위 단계의 그룹에 붙인다', () => {
    const users = parseUserImport(text).users;
    expect(users.map((u) => [u.username, u.groupPath])).toEqual([
      ['gigu01', ['운영기술센터', '기구완성팀']],
      ['gigu02', ['운영기술센터', '기구완성팀']],
      ['saeng01', ['운영기술센터', '생산기술팀']],
      ['center01', ['운영기술센터']],
      ['gumae01', ['구매팀']],
      ['ceo01', []],
    ]);
  });

  it('원본 줄 번호를 그대로 들고 있다', () => {
    const users = parseUserImport(text).users;
    // 1번 줄이 주석이므로 첫 사용자는 4번 줄이다
    expect(users[0]!.line).toBe(4);
    expect(users.at(-1)!.line).toBe(12);
  });
});

describe('parseUserImport() — 들여쓰기', () => {
  it('탭 하나를 공백 4칸으로 본다', () => {
    const text = ['본부', '\t팀', '\t\t- aaa01, 김하나-팀'].join('\n');
    const r = parseUserImport(text);
    expect(r.issues).toEqual([]);
    expect(r.users[0]!.groupPath).toEqual(['본부', '팀']);
  });

  it('폭이 2칸이든 4칸이든 파일 안에서 일관되면 통과한다', () => {
    const text = ['본부', '    팀', '        - aaa01, 김하나-팀'].join('\n');
    expect(parseUserImport(text).users[0]!.groupPath).toEqual(['본부', '팀']);
  });

  it('어느 단계와도 맞지 않는 들여쓰기는 BAD_INDENT 로 잡는다', () => {
    const text = ['본부', '  팀', '      하위팀', '   어중간'].join('\n');
    expect(parseUserImport(text).issues.map((i) => [i.line, i.code])).toEqual([[4, 'BAD_INDENT']]);
  });

  it('사용자 줄 아래에 그룹을 넣으면 BAD_INDENT 로 잡는다', () => {
    const text = ['본부', '  - aaa01, 김하나-본부', '    팀'].join('\n');
    expect(parseUserImport(text).issues.map((i) => i.code)).toEqual(['BAD_INDENT']);
  });
});

describe('parseUserImport() — 사용자 줄', () => {
  it('이름 안의 쉼표를 자르지 않는다', () => {
    expect(parseUserImport('- aaa01, 김하나, 팀장').users[0]!.displayName).toBe('김하나, 팀장');
  });

  it('쉼표가 없으면 BAD_USER_LINE', () => {
    expect(parseUserImport('- aaa01 김하나').issues[0]!.code).toBe('BAD_USER_LINE');
  });

  it('이름이 비면 BAD_USER_LINE', () => {
    expect(parseUserImport('- aaa01,   ').issues[0]!.code).toBe('BAD_USER_LINE');
  });

  it('한글 아이디는 INVALID_USERNAME', () => {
    expect(parseUserImport('- 김하나, 김하나-팀').issues[0]!.code).toBe('INVALID_USERNAME');
  });

  it('두 글자 아이디는 INVALID_USERNAME', () => {
    expect(parseUserImport('- ab, 김하나-팀').issues[0]!.code).toBe('INVALID_USERNAME');
  });

  it('표시 이름이 128자를 넘으면 NAME_TOO_LONG', () => {
    const long = 'ㄱ'.repeat(129);
    expect(parseUserImport(`- aaa01, ${long}`).issues[0]!.code).toBe('NAME_TOO_LONG');
  });
});

describe('parseUserImport() — 중복과 한계', () => {
  it('같은 아이디가 두 번 나오면 뒤엣것을 DUPLICATE_USERNAME_IN_FILE 로 잡는다', () => {
    const text = ['- aaa01, 김하나-팀', '- aaa01, 이두리-팀'].join('\n');
    const r = parseUserImport(text);
    expect(r.issues.map((i) => [i.line, i.code])).toEqual([[2, 'DUPLICATE_USERNAME_IN_FILE']]);
    expect(r.users).toHaveLength(1);
  });

  it('같은 부모 아래 같은 그룹 이름이 두 번 나오면 DUPLICATE_GROUP_IN_FILE', () => {
    const text = ['본부', '  팀', '  팀'].join('\n');
    expect(parseUserImport(text).issues.map((i) => i.code)).toEqual(['DUPLICATE_GROUP_IN_FILE']);
  });

  it('부모가 다르면 같은 이름을 허용한다', () => {
    const text = ['본부A', '  개발팀', '본부B', '  개발팀'].join('\n');
    expect(parseUserImport(text).issues).toEqual([]);
  });

  it('그룹 이름이 64자를 넘으면 NAME_TOO_LONG', () => {
    expect(parseUserImport('ㄱ'.repeat(65)).issues[0]!.code).toBe('NAME_TOO_LONG');
  });

  it('9단계째 그룹은 GROUP_DEPTH_EXCEEDED', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `${'  '.repeat(i)}g${i}`);
    expect(parseUserImport(lines.join('\n')).issues.map((i) => [i.line, i.code])).toEqual([
      [9, 'GROUP_DEPTH_EXCEEDED'],
    ]);
  });

  it('내용이 될 줄이 없으면 EMPTY_FILE', () => {
    expect(parseUserImport('\n# 주석만 있다\n   \n').issues).toEqual([
      { line: 0, code: 'EMPTY_FILE', message: '등록할 내용이 없습니다.' },
    ]);
  });

  it('오류가 여럿이면 첫 번째에서 멈추지 않고 모두 모은다', () => {
    const text = ['- 김하나, 이름', '- ab, 이름', '- ccc01 이름'].join('\n');
    expect(parseUserImport(text).issues.map((i) => i.code)).toEqual([
      'INVALID_USERNAME',
      'INVALID_USERNAME',
      'BAD_USER_LINE',
    ]);
  });
});
