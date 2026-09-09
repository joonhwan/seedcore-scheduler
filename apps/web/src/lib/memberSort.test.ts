import { describe, expect, it } from 'vitest';
import { compareByDisplayName, sortMembersForDisplay } from './memberSort';

function member(displayName: string, role: 'MANAGER' | 'MEMBER', username = displayName) {
  return { userId: username, username, displayName, role };
}

describe('compareByDisplayName', () => {
  it('한글 이름을 가나다 순으로 놓는다', () => {
    const names = [{ displayName: '홍길동' }, { displayName: '강문수' }, { displayName: '박지원' }];
    expect(names.slice().sort(compareByDisplayName).map((n) => n.displayName)).toEqual([
      '강문수',
      '박지원',
      '홍길동',
    ]);
  });

  it('대소문자를 가리지 않는다', () => {
    // 바이트 순서로 놓으면 대문자가 모두 소문자보다 앞에 몰려 'Zulu' 가 'alpha' 앞에 온다.
    const names = [{ displayName: 'Zulu' }, { displayName: 'alpha' }, { displayName: 'Bravo' }];
    expect(names.slice().sort(compareByDisplayName).map((n) => n.displayName)).toEqual([
      'alpha',
      'Bravo',
      'Zulu',
    ]);
  });

  it('이름이 같으면 username 으로 순서를 고정한다', () => {
    // 동명이인의 순서가 다시 그릴 때마다 바뀌면 고른 줄을 놓친다.
    const rows = [
      { displayName: '홍길동', username: 'hong.b' },
      { displayName: '홍길동', username: 'hong.a' },
    ];
    expect(rows.slice().sort(compareByDisplayName).map((r) => r.username)).toEqual([
      'hong.a',
      'hong.b',
    ]);
  });
});

describe('sortMembersForDisplay', () => {
  it('MANAGER 묶음을 위에 두고 각 묶음 안에서 이름순으로 놓는다', () => {
    const rows = [
      member('홍길동', 'MEMBER'),
      member('이준환', 'MANAGER'),
      member('강문수', 'MEMBER'),
      member('김천수', 'MANAGER'),
    ];
    expect(sortMembersForDisplay(rows).map((m) => `${m.role}:${m.displayName}`)).toEqual([
      'MANAGER:김천수',
      'MANAGER:이준환',
      'MEMBER:강문수',
      'MEMBER:홍길동',
    ]);
  });

  it('받은 배열을 건드리지 않는다', () => {
    // TanStack Query 의 캐시 배열을 그대로 받으므로 제자리에서 정렬하면 캐시를 오염시킨다.
    const rows = [member('홍길동', 'MEMBER'), member('김천수', 'MANAGER')];
    sortMembersForDisplay(rows);
    expect(rows.map((m) => m.displayName)).toEqual(['홍길동', '김천수']);
  });
});

describe('compareByDisplayName — 문자 종류의 순서', () => {
  it('영문 이름을 한글 이름보다 앞에 놓는다', () => {
    // 한국어 대조 규칙(Intl.Collator('ko'))은 한글을 라틴 문자보다 앞에 놓는다.
    // 이 프로젝트에서는 그 반대가 자연스럽다고 보아 문자 종류로 먼저 묶는다.
    const names = [
      { displayName: '강문수' },
      { displayName: 'Zulu' },
      { displayName: '가나다' },
      { displayName: 'alpha' },
    ];
    expect(names.slice().sort(compareByDisplayName).map((n) => n.displayName)).toEqual([
      'alpha',
      'Zulu',
      '가나다',
      '강문수',
    ]);
  });

  it('숫자나 기호로 시작하는 이름도 한글보다 앞에 놓는다', () => {
    const names = [{ displayName: '홍길동' }, { displayName: '(주)미래로' }, { displayName: '3팀' }];
    expect(names.slice().sort(compareByDisplayName).map((n) => n.displayName)).toEqual([
      '(주)미래로',
      '3팀',
      '홍길동',
    ]);
  });

  it('한글 자모로 시작하는 이름도 한글로 본다', () => {
    const names = [{ displayName: 'ㄱ님' }, { displayName: 'Ada' }];
    expect(names.slice().sort(compareByDisplayName).map((n) => n.displayName)).toEqual([
      'Ada',
      'ㄱ님',
    ]);
  });
});
