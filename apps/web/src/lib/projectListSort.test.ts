import { describe, it, expect } from 'vitest';
import type { ProjectListItem } from '@sam/shared';
import { compareProjectsByCreation } from './projectListSort';

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
    ...over,
  };
}

describe('compareProjectsByCreation', () => {
  it('먼저 만들어진 것이 앞에 온다', () => {
    const older = project({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = project({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z' });

    expect(compareProjectsByCreation(older, newer)).toBeLessThan(0);
    expect(compareProjectsByCreation(newer, older)).toBeGreaterThan(0);
  });

  it('createdAt 이 같으면 id 로 순서를 고정한다', () => {
    const a = project({ id: 'aaa', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = project({ id: 'bbb', createdAt: '2026-01-01T00:00:00.000Z' });

    expect(compareProjectsByCreation(a, b)).toBeLessThan(0);
    expect(compareProjectsByCreation(b, a)).toBeGreaterThan(0);
  });

  it('같은 프로젝트끼리는 0 이다', () => {
    const a = project({ id: 'aaa' });

    expect(compareProjectsByCreation(a, a)).toBe(0);
  });

  it('status 는 순서에 영향을 주지 않는다', () => {
    // 보관 처리를 해도 행이 제자리에 남아야 하므로, status 를 정렬 키에서 뺐다.
    const older = project({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z', status: 'ARCHIVED' });
    const newer = project({ id: 'b', createdAt: '2026-06-01T00:00:00.000Z', status: 'ACTIVE' });

    expect(compareProjectsByCreation(older, newer)).toBeLessThan(0);
  });

  it('updatedAt 은 순서에 영향을 주지 않는다', () => {
    // 이 테스트가 이 함수의 존재 이유다. 예전에는 서버 순서(updatedAt desc)를 그대로 써서,
    // 목록에서 뭔가를 고치면 그 행이 다른 페이지로 옮겨갔다.
    const older = project({
      id: 'a',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-12-31T00:00:00.000Z', // 방금 수정됨
    });
    const newer = project({
      id: 'b',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(compareProjectsByCreation(older, newer)).toBeLessThan(0);
  });

  it('정렬에 넣으면 생성 순서대로 늘어선다', () => {
    const list = [
      project({ id: 'c', createdAt: '2026-03-01T00:00:00.000Z' }),
      project({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      project({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }),
    ];

    expect([...list].sort(compareProjectsByCreation).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('보관 처리로 status 와 updatedAt 이 바뀌어도 순서가 그대로다', () => {
    const before = [
      project({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      project({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' }),
      project({ id: 'c', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    // b 를 보관 처리한 뒤의 목록
    const after = before.map((p) =>
      p.id === 'b'
        ? { ...p, status: 'ARCHIVED' as const, updatedAt: '2026-12-31T00:00:00.000Z' }
        : p,
    );

    expect([...after].sort(compareProjectsByCreation).map((p) => p.id)).toEqual(
      [...before].sort(compareProjectsByCreation).map((p) => p.id),
    );
  });
});
