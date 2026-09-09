import { describe, expect, it } from 'vitest';
import { headerCheckState, pruneSelection, summarizeNames } from './memberSelection';

describe('headerCheckState', () => {
  it('아무것도 고르지 않았으면 해제 상태다', () => {
    expect(headerCheckState(0, 5)).toBe('unchecked');
  });

  it('일부만 골랐으면 중간 상태다', () => {
    expect(headerCheckState(2, 5)).toBe('indeterminate');
  });

  it('전부 골랐으면 선택 상태다', () => {
    expect(headerCheckState(5, 5)).toBe('checked');
  });

  it('목록이 비어 있으면 해제 상태다', () => {
    // 빈 목록에서 0 === 0 을 그대로 쓰면 머리 체크박스가 선택된 것처럼 보인다.
    expect(headerCheckState(0, 0)).toBe('unchecked');
  });
});

describe('pruneSelection', () => {
  it('목록에서 사라진 사람을 선택에서 뗀다', () => {
    // 추가가 끝나면 그 사람은 후보 목록에서 사라진다. 선택만 남으면 버튼의 인원수가
    // 실제로 고른 사람 수와 어긋난다.
    const pruned = pruneSelection(new Set(['u1', 'u2', 'u3']), ['u1', 'u3']);
    expect([...pruned].sort()).toEqual(['u1', 'u3']);
  });

  it('바뀐 것이 없으면 같은 집합을 그대로 돌려준다', () => {
    // React 상태에 그대로 넣으므로, 내용이 같은데 새 집합을 만들면 다시 그리는 일이 늘고
    // 효과(useEffect) 안에서 쓰면 무한 반복이 된다.
    const before = new Set(['u1', 'u2']);
    expect(pruneSelection(before, ['u1', 'u2', 'u9'])).toBe(before);
  });
});

describe('summarizeNames', () => {
  it('적으면 모두 나열한다', () => {
    expect(summarizeNames(['홍길동', '김철수'], 3)).toBe('홍길동, 김철수');
  });

  it('많으면 앞의 몇 명만 적고 나머지는 인원수로 줄인다', () => {
    expect(summarizeNames(['가', '나', '다', '라', '마'], 3)).toBe('가, 나, 다 외 2명');
  });

  it('한도와 같은 인원이면 「외 0명」을 붙이지 않는다', () => {
    expect(summarizeNames(['가', '나', '다'], 3)).toBe('가, 나, 다');
  });
});
