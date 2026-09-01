import { describe, it, expect } from 'vitest';
import type { ProjectListItem } from '@sam/shared';
import { compareProjectsByRecentlyModified } from './projectListSort';

/** 테스트에 필요한 필드만 채운 프로젝트 하나를 만든다. */
function project(over: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: 'id-0',
    name: '프로젝트',
    description: null,
    status: 'ACTIVE',
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
