import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ProjectListItem } from '@sam/shared';
import {
  compareProjectsByRecentlyModified,
  parseSortSelection,
  serializeSortSelection,
  loadSortSelection,
  saveSortSelection,
  nextSortSelection,
  PROJECT_SORT_FIELDS,
} from './projectListSort';

/** 테스트에 필요한 필드만 채운 프로젝트 하나를 만든다. */
function project(over: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: 'id-0',
    name: '프로젝트',
    description: null,
    status: 'ACTIVE',
    priority: 0,
    myRole: 'MANAGER',
    memberCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastScheduleChangeAt: null,
    ...over,
  };
}

describe('compareProjectsByRecentlyModified', () => {
  it('최근에 수정된 것이 앞에 온다', () => {
    const older = project({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = project({ id: 'b', updatedAt: '2026-06-01T00:00:00.000Z' });

    expect(compareProjectsByRecentlyModified(newer, older)).toBeLessThan(0);
    expect(compareProjectsByRecentlyModified(older, newer)).toBeGreaterThan(0);
  });

  it('일정만 고친 프로젝트가 위로 올라온다', () => {
    // 이 테스트가 이 정렬의 존재 이유다. 프로젝트 행 자체는 몇 달째 그대로인데 일정만
    // 계속 고치는 것이 실제 사용 형태다. lastScheduleChangeAt 을 보지 않으면 그런
    // 프로젝트가 목록 아래에 묻힌다.
    const busy = project({
      id: 'busy',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastScheduleChangeAt: '2026-08-30T00:00:00.000Z',
    });
    const idle = project({
      id: 'idle',
      updatedAt: '2026-05-01T00:00:00.000Z',
      lastScheduleChangeAt: null,
    });

    expect(compareProjectsByRecentlyModified(busy, idle)).toBeLessThan(0);
  });

  it('프로젝트 이름 변경이 일정 변경보다 최근이면 그쪽을 따른다', () => {
    const renamed = project({
      id: 'renamed',
      updatedAt: '2026-08-31T00:00:00.000Z',
      lastScheduleChangeAt: '2026-02-01T00:00:00.000Z',
    });
    const scheduled = project({
      id: 'scheduled',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastScheduleChangeAt: '2026-08-30T00:00:00.000Z',
    });

    expect(compareProjectsByRecentlyModified(renamed, scheduled)).toBeLessThan(0);
  });

  it('생성일은 순서에 영향을 주지 않는다', () => {
    const oldButBusy = project({
      id: 'a',
      createdAt: '2020-01-01T00:00:00.000Z',
      lastScheduleChangeAt: '2026-08-30T00:00:00.000Z',
    });
    const newButIdle = project({
      id: 'b',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(compareProjectsByRecentlyModified(oldButBusy, newButIdle)).toBeLessThan(0);
  });

  it('수정 시각이 같으면 id 로 순서를 고정한다', () => {
    const a = project({ id: 'aaa', updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = project({ id: 'bbb', updatedAt: '2026-01-01T00:00:00.000Z' });

    expect(compareProjectsByRecentlyModified(a, b)).toBeLessThan(0);
    expect(compareProjectsByRecentlyModified(b, a)).toBeGreaterThan(0);
  });

  it('같은 프로젝트끼리는 0 이다', () => {
    const a = project({ id: 'aaa' });

    expect(compareProjectsByRecentlyModified(a, a)).toBe(0);
  });

  it('status 는 순서에 영향을 주지 않는다', () => {
    // 보관 여부는 상태 필터와 배지가 담당한다. 보관했다고 목록 맨 뒤로 보내지 않는다.
    const older = project({
      id: 'a',
      updatedAt: '2026-06-01T00:00:00.000Z',
      status: 'ARCHIVED',
    });
    const newer = project({
      id: 'b',
      updatedAt: '2026-01-01T00:00:00.000Z',
      status: 'ACTIVE',
    });

    expect(compareProjectsByRecentlyModified(older, newer)).toBeLessThan(0);
  });

  it('정렬에 넣으면 최근에 손댄 것부터 늘어선다', () => {
    const list = [
      project({ id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' }),
      project({
        id: 'c',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastScheduleChangeAt: '2026-03-01T00:00:00.000Z',
      }),
      project({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];

    expect(
      [...list].sort(compareProjectsByRecentlyModified).map((p) => p.id),
    ).toEqual(['c', 'b', 'a']);
  });
});

describe('parseSortSelection', () => {
  it('저장해 둔 정렬 선택을 그대로 돌려준다', () => {
    const raw = serializeSortSelection({ by: 'name', order: 'asc' });

    expect(parseSortSelection(raw)).toEqual({ by: 'name', order: 'asc' });
  });

  it('방향이 내림차순인 선택도 그대로 돌려준다', () => {
    const raw = serializeSortSelection({ by: 'createdAt', order: 'desc' });

    expect(parseSortSelection(raw)).toEqual({ by: 'createdAt', order: 'desc' });
  });

  it('정렬 없음(기본 정렬) 상태도 저장했다가 복원한다', () => {
    // 헤더를 세 번 눌러 기본 정렬로 되돌린 것도 사용자의 선택이므로 유지되어야 한다.
    const raw = serializeSortSelection(null);

    expect(parseSortSelection(raw)).toBeNull();
  });

  it('저장된 적이 없으면 기본 정렬이다', () => {
    expect(parseSortSelection(null)).toBeNull();
  });

  it('목록에 없는 컬럼 이름이면 기본 정렬로 떨어뜨린다', () => {
    // 컬럼이 사라지거나 이름이 바뀌면 옛 값이 브라우저에 남는다. 그대로 쓰면 존재하지
    // 않는 필드로 정렬을 시도해 목록이 뒤죽박죽으로 보인다.
    expect(parseSortSelection('{"by":"lastScheduleChangeAt","order":"asc"}')).toBeNull();
  });

  it('방향 값이 이상하면 기본 정렬로 떨어뜨린다', () => {
    expect(parseSortSelection('{"by":"name","order":"sideways"}')).toBeNull();
  });

  it('JSON 이 깨져 있어도 예외를 던지지 않고 기본 정렬로 떨어뜨린다', () => {
    // localStorage 는 사용자가 직접 고칠 수 있다.
    expect(parseSortSelection('{"by":')).toBeNull();
  });

  it('JSON 이지만 객체가 아니면 기본 정렬로 떨어뜨린다', () => {
    expect(parseSortSelection('"name"')).toBeNull();
    expect(parseSortSelection('[1,2,3]')).toBeNull();
  });

  it('중요도 컬럼을 정렬 기준으로 받아들인다', () => {
    expect(parseSortSelection('{"by":"priority","order":"desc"}')).toEqual({
      by: 'priority',
      order: 'desc',
    });
  });

  it('정렬 가능한 컬럼 일곱 개를 모두 받아들인다', () => {
    // 화면의 헤더와 이 목록이 어긋나면, 사용자가 고른 정렬이 조용히 무시된다.
    for (const by of PROJECT_SORT_FIELDS) {
      expect(parseSortSelection(serializeSortSelection({ by, order: 'asc' }))).toEqual({
        by,
        order: 'asc',
      });
    }
  });
});

describe('loadSortSelection / saveSortSelection', () => {
  /** localStorage 를 대신할 최소 구현. 테스트마다 새로 만든다. */
  function fakeStorage(seed: Record<string, string> = {}) {
    const box = { ...seed };
    return {
      getItem: (k: string) => (k in box ? box[k]! : null),
      setItem: (k: string, v: string) => {
        box[k] = v;
      },
      removeItem: (k: string) => {
        delete box[k];
      },
      clear: () => {
        for (const k of Object.keys(box)) delete box[k];
      },
      key: () => null,
      length: 0,
      box,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장한 정렬 선택을 다음에 그대로 읽어 온다', () => {
    vi.stubGlobal('localStorage', fakeStorage());

    saveSortSelection({ by: 'name', order: 'asc' });

    expect(loadSortSelection()).toEqual({ by: 'name', order: 'asc' });
  });

  it('저장한 적이 없으면 기본 정렬이다', () => {
    vi.stubGlobal('localStorage', fakeStorage());

    expect(loadSortSelection()).toBeNull();
  });

  it('저장소를 쓸 수 없는 환경에서도 화면이 죽지 않는다', () => {
    // 브라우저의 사생활 보호 모드나 쿠키 차단 설정에서는 localStorage 접근 자체가
    // 예외를 던진다. 목록 화면 전체가 그것 때문에 뜨지 않으면 안 된다.
    const blocked = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('access denied');
      },
    };
    vi.stubGlobal('localStorage', blocked);

    expect(() => saveSortSelection({ by: 'name', order: 'asc' })).not.toThrow();
    expect(loadSortSelection()).toBeNull();
  });
});

describe('nextSortSelection', () => {
  it('정렬하지 않던 컬럼을 누르면 오름차순으로 시작한다', () => {
    expect(nextSortSelection(null, 'name')).toEqual({ by: 'name', order: 'asc' });
  });

  it('오름차순인 컬럼을 다시 누르면 내림차순이 된다', () => {
    expect(nextSortSelection({ by: 'name', order: 'asc' }, 'name')).toEqual({
      by: 'name',
      order: 'desc',
    });
  });

  it('내림차순인 컬럼을 한 번 더 누르면 기본 정렬로 돌아간다', () => {
    expect(nextSortSelection({ by: 'name', order: 'desc' }, 'name')).toBeNull();
  });

  it('다른 컬럼을 누르면 그 컬럼의 오름차순으로 옮겨 간다', () => {
    expect(nextSortSelection({ by: 'name', order: 'desc' }, 'memberCount')).toEqual({
      by: 'memberCount',
      order: 'asc',
    });
  });

  it('세 번 누르면 제자리로 돌아온다', () => {
    // 오름차순 → 내림차순 → 해제. 기존 화면 동작을 그대로 지킨다.
    const once = nextSortSelection(null, 'createdAt');
    const twice = nextSortSelection(once, 'createdAt');
    const thrice = nextSortSelection(twice, 'createdAt');

    expect(thrice).toBeNull();
  });

  it('중요도 컬럼은 첫 클릭이 내림차순이다', () => {
    // 중요도로 정렬하는 의도는 거의 언제나 "중요한 것을 위에서 보겠다" 이다.
    expect(nextSortSelection(null, 'priority')).toEqual({ by: 'priority', order: 'desc' });
  });

  it('중요도를 한 번 더 누르면 오름차순이 된다', () => {
    expect(nextSortSelection({ by: 'priority', order: 'desc' }, 'priority')).toEqual({
      by: 'priority',
      order: 'asc',
    });
  });

  it('중요도를 세 번째 누르면 기본 정렬로 돌아간다', () => {
    expect(nextSortSelection({ by: 'priority', order: 'asc' }, 'priority')).toBeNull();
  });

  it('다른 컬럼의 첫 클릭은 여전히 오름차순이다', () => {
    expect(nextSortSelection(null, 'name')).toEqual({ by: 'name', order: 'asc' });
    expect(nextSortSelection(null, 'memberCount')).toEqual({ by: 'memberCount', order: 'asc' });
  });
});

describe('설명 컬럼 정렬', () => {
  it('설명을 정렬 기준으로 받아들인다', () => {
    expect(parseSortSelection('{"by":"description","order":"asc"}')).toEqual({
      by: 'description',
      order: 'asc',
    });
  });

  it('설명 컬럼의 첫 클릭은 오름차순이다', () => {
    // "가나다순으로 보겠다" 가 자연스러운 의도다. 중요도만 내림차순으로 시작하는
    // 예외이며, 설명은 기본 규칙을 따른다.
    expect(nextSortSelection(null, 'description')).toEqual({
      by: 'description',
      order: 'asc',
    });
  });

  it('설명도 세 번 누르면 기본 정렬로 돌아간다', () => {
    const once = nextSortSelection(null, 'description');
    const twice = nextSortSelection(once, 'description');

    expect(twice).toEqual({ by: 'description', order: 'desc' });
    expect(nextSortSelection(twice, 'description')).toBeNull();
  });
});
