import { describe, expect, it } from 'vitest';
import { buildReleaseName, formatDate } from './release-name.js';

describe('formatDate', () => {
  it('YYYYMMDD 로 만든다', () => {
    expect(formatDate(new Date(2026, 7, 1))).toBe('20260801');
  });

  it('한 자리 월/일을 0 으로 채운다', () => {
    // 0 패딩을 빠뜨리면 '202619' 처럼 자릿수가 흔들려 파일 이름 정렬이 깨진다.
    expect(formatDate(new Date(2026, 0, 9))).toBe('20260109');
  });
});

describe('buildReleaseName', () => {
  const date = new Date(2026, 7, 1);

  it('접두어-날짜-해시 형태로 만든다', () => {
    expect(buildReleaseName({ date, sha: '1140f3f', dirty: false })).toBe(
      'sam-scheduler-exe-20260801-1140f3f',
    );
  });

  it('작업 트리가 더러우면 -dirty 를 붙인다', () => {
    expect(buildReleaseName({ date, sha: '1140f3f', dirty: true })).toBe(
      'sam-scheduler-exe-20260801-1140f3f-dirty',
    );
  });

  it('git 정보가 없으면 nogit 으로 대체한다', () => {
    expect(buildReleaseName({ date, sha: null, dirty: false })).toBe(
      'sam-scheduler-exe-20260801-nogit',
    );
  });

  it('빈 문자열 sha 도 nogit 으로 본다', () => {
    // execFileSync 결과를 trim 하면 빈 문자열이 될 수 있다. null 만 검사하면 이름이
    // 'sam-scheduler-exe-20260801-' 처럼 끝이 잘린 채로 만들어진다.
    expect(buildReleaseName({ date, sha: '', dirty: false })).toBe(
      'sam-scheduler-exe-20260801-nogit',
    );
  });

  it('접두어를 바꿀 수 있다', () => {
    expect(buildReleaseName({ date, sha: 'abc1234', dirty: false, prefix: 'test-pkg' })).toBe(
      'test-pkg-20260801-abc1234',
    );
  });
});
