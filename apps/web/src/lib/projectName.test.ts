import { describe, it, expect } from 'vitest';
import {
  canSubmitProjectName,
  normalizeProjectName,
  PROJECT_NAME_MAX_LENGTH,
} from './projectName';

describe('normalizeProjectName', () => {
  it('앞뒤 공백을 버린다', () => {
    expect(normalizeProjectName('  기획  ')).toBe('기획');
  });

  it('가운데 공백은 그대로 둔다', () => {
    expect(normalizeProjectName(' 2026 상반기 기획 ')).toBe('2026 상반기 기획');
  });

  it('탭과 개행도 공백으로 보고 버린다', () => {
    expect(normalizeProjectName('\t기획\n')).toBe('기획');
  });
});

describe('canSubmitProjectName', () => {
  const CURRENT = '기획';

  it('빈 문자열이면 false', () => {
    expect(canSubmitProjectName('', CURRENT)).toBe(false);
  });

  it('공백만 있으면 false', () => {
    expect(canSubmitProjectName('   ', CURRENT)).toBe(false);
  });

  it('현재 이름과 같으면 false', () => {
    expect(canSubmitProjectName(CURRENT, CURRENT)).toBe(false);
  });

  it('앞뒤 공백만 다르면 변경으로 보지 않는다 (trim 후 비교)', () => {
    expect(canSubmitProjectName('  기획  ', CURRENT)).toBe(false);
  });

  it('실제로 다른 이름이면 true', () => {
    expect(canSubmitProjectName('신규 기획', CURRENT)).toBe(true);
  });

  it('앞뒤 공백을 버린 결과가 다르면 true', () => {
    expect(canSubmitProjectName('  신규 기획  ', CURRENT)).toBe(true);
  });

  it(`${PROJECT_NAME_MAX_LENGTH}자는 허용한다 (경계)`, () => {
    const name = 'a'.repeat(PROJECT_NAME_MAX_LENGTH);
    expect(canSubmitProjectName(name, CURRENT)).toBe(true);
  });

  it(`${PROJECT_NAME_MAX_LENGTH + 1}자는 거부한다 (경계)`, () => {
    const name = 'a'.repeat(PROJECT_NAME_MAX_LENGTH + 1);
    expect(canSubmitProjectName(name, CURRENT)).toBe(false);
  });

  it('공백을 버리면 상한 이내가 되는 입력은 허용한다', () => {
    const name = ` ${'a'.repeat(PROJECT_NAME_MAX_LENGTH)} `;
    expect(canSubmitProjectName(name, CURRENT)).toBe(true);
  });

  it('저장된 이름에 공백이 섞여 있으면 정리하는 방향의 변경은 허용한다', () => {
    expect(canSubmitProjectName('기획', ' 기획 ')).toBe(true);
  });
});
