import { describe, it, expect } from 'vitest';
import {
  PROJECT_PRIORITY_MIN,
  PROJECT_PRIORITY_MAX,
  PROJECT_PRIORITY_OPTIONS,
  projectPriorityLabel,
  UpdateProjectDto,
  ProjectListItem,
} from './index';

describe('projectPriorityLabel', () => {
  it('일곱 단계를 모두 말로 옮긴다', () => {
    expect(projectPriorityLabel(3)).toBe('최우선');
    expect(projectPriorityLabel(2)).toBe('높음');
    expect(projectPriorityLabel(1)).toBe('다소 높음');
    expect(projectPriorityLabel(0)).toBe('보통');
    expect(projectPriorityLabel(-1)).toBe('다소 낮음');
    expect(projectPriorityLabel(-2)).toBe('낮음');
    expect(projectPriorityLabel(-3)).toBe('최하');
  });

  it('표에 없는 값이 와도 화면이 깨지지 않게 부호를 붙여 돌려준다', () => {
    // 나중에 범위를 넓혔다 되돌리거나 DB 를 직접 고친 경우에도 목록은 떠야 한다.
    expect(projectPriorityLabel(5)).toBe('+5');
    expect(projectPriorityLabel(-9)).toBe('-9');
  });
});

describe('PROJECT_PRIORITY_OPTIONS', () => {
  it('큰 값부터 늘어선다', () => {
    expect(PROJECT_PRIORITY_OPTIONS.map((o) => o.value)).toEqual([3, 2, 1, 0, -1, -2, -3]);
  });

  it('라벨이 projectPriorityLabel 과 어긋나지 않는다', () => {
    for (const o of PROJECT_PRIORITY_OPTIONS) {
      expect(o.label).toBe(projectPriorityLabel(o.value));
    }
  });

  it('범위 상수와 양 끝이 맞는다', () => {
    const values = PROJECT_PRIORITY_OPTIONS.map((o) => o.value);
    expect(Math.max(...values)).toBe(PROJECT_PRIORITY_MAX);
    expect(Math.min(...values)).toBe(PROJECT_PRIORITY_MIN);
  });
});

describe('UpdateProjectDto 의 priority', () => {
  const base = { expectedUpdatedAt: '2026-09-14T00:00:00.000Z' };

  it('중요도만 담긴 요청을 받아들인다', () => {
    expect(UpdateProjectDto.safeParse({ ...base, priority: 2 }).success).toBe(true);
  });

  it('양 끝 값을 받아들인다', () => {
    expect(UpdateProjectDto.safeParse({ ...base, priority: 3 }).success).toBe(true);
    expect(UpdateProjectDto.safeParse({ ...base, priority: -3 }).success).toBe(true);
  });

  it('범위를 벗어난 값을 거부한다', () => {
    expect(UpdateProjectDto.safeParse({ ...base, priority: 4 }).success).toBe(false);
    expect(UpdateProjectDto.safeParse({ ...base, priority: -4 }).success).toBe(false);
  });

  it('정수가 아닌 값을 거부한다', () => {
    expect(UpdateProjectDto.safeParse({ ...base, priority: 1.5 }).success).toBe(false);
  });

  it('바꿀 항목이 하나도 없으면 여전히 거부한다', () => {
    expect(UpdateProjectDto.safeParse(base).success).toBe(false);
  });
});

describe('ProjectListItem 의 priority', () => {
  const row = {
    id: 'p1',
    name: '프로젝트',
    description: null,
    status: 'ACTIVE',
    myRole: 'MANAGER',
    memberCount: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    lastScheduleChangeAt: null,
  };

  it('중요도를 담아 돌려준다', () => {
    const parsed = ProjectListItem.safeParse({ ...row, priority: 2 });
    expect(parsed.success).toBe(true);
  });

  it('응답에는 범위 제한을 걸지 않는다', () => {
    // 응답 스키마가 DB 의 현재 값을 거부하면 목록 전체가 뜨지 않는다.
    expect(ProjectListItem.safeParse({ ...row, priority: 99 }).success).toBe(true);
  });
});
