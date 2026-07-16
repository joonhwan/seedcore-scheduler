import { describe, it, expect } from 'vitest';
import {
  getProgressChange,
  isProgressDown,
  isPeriodChange,
  classifyChange,
  selectHistoryByTopic,
  buildProjectHistory,
  type RawHistoryRow,
  type RawCommentRow,
  type NodeMeta,
} from './history-utils';
import { ProjectHistoryQuery } from './index';

describe('getProgressChange', () => {
  it('progress 의 from/to 가 숫자면 그대로 반환', () => {
    expect(getProgressChange({ progress: { from: 80, to: 50 } })).toEqual({ from: 80, to: 50 });
  });
  it('progress 가 없으면 null', () => {
    expect(getProgressChange({ title: { from: 'a', to: 'b' } })).toBeNull();
  });
  it('from/to 가 숫자가 아니면 null', () => {
    expect(getProgressChange({ progress: { from: null, to: 50 } })).toBeNull();
  });
});

describe('isProgressDown', () => {
  it('to < from 이면 참', () => {
    expect(isProgressDown({ progress: { from: 80, to: 50 } })).toBe(true);
  });
  it('to > from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 80 } })).toBe(false);
  });
  it('to === from 이면 거짓', () => {
    expect(isProgressDown({ progress: { from: 50, to: 50 } })).toBe(false);
  });
  it('progress 변경이 없으면 거짓', () => {
    expect(isProgressDown({ title: { from: 'a', to: 'b' } })).toBe(false);
  });
});

describe('isPeriodChange', () => {
  it('startAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ startAt: { from: '2026-01-01', to: '2026-01-02' } })).toBe(true);
  });
  it('endAt 이 바뀌면 참', () => {
    expect(isPeriodChange({ endAt: { from: null, to: '2026-02-15' } })).toBe(true);
  });
  it('기간 필드가 없으면 거짓', () => {
    expect(isPeriodChange({ progress: { from: 10, to: 20 } })).toBe(false);
  });
});

describe('classifyChange', () => {
  it('UPDATE + 진행률 내림 → PROGRESS_DOWN', () => {
    expect(classifyChange('UPDATE', { progress: { from: 80, to: 50 } })).toBe('PROGRESS_DOWN');
  });
  it('UPDATE + 진행률 올림 → PROGRESS_UP', () => {
    expect(classifyChange('UPDATE', { progress: { from: 50, to: 80 } })).toBe('PROGRESS_UP');
  });
  it('UPDATE + 100% 도달 → PROGRESS_DONE', () => {
    expect(classifyChange('UPDATE', { progress: { from: 90, to: 100 } })).toBe('PROGRESS_DONE');
  });
  it('UPDATE + 기간 변경 → PERIOD', () => {
    expect(classifyChange('UPDATE', { endAt: { from: '2026-01-31', to: '2026-02-15' } })).toBe('PERIOD');
  });
  it('UPDATE + 제목 변경 → TITLE', () => {
    expect(classifyChange('UPDATE', { title: { from: 'a', to: 'b' } })).toBe('TITLE');
  });
  it('DELETE → DELETE', () => {
    expect(classifyChange('DELETE', {})).toBe('DELETE');
  });
  it('CREATE → CREATE', () => {
    expect(classifyChange('CREATE', {})).toBe('CREATE');
  });
  it('MOVE → MOVE', () => {
    expect(classifyChange('MOVE', {})).toBe('MOVE');
  });
  it('UPDATE + 진행률 값 동일 → PROGRESS_SET', () => {
    expect(classifyChange('UPDATE', { progress: { from: 50, to: 50 } })).toBe('PROGRESS_SET');
  });
  it('RESTORE → RESTORE', () => {
    expect(classifyChange('RESTORE', {})).toBe('RESTORE');
  });
  it('UPDATE + 분류되지 않는 diff → OTHER', () => {
    expect(classifyChange('UPDATE', {})).toBe('OTHER');
  });
});

function hist(partial: Partial<RawHistoryRow> & { id: string }): RawHistoryRow {
  return {
    nodeIdSnapshot: 'n1',
    projectIdSnapshot: 'p1',
    actorId: 'u1',
    actorUsername: 'user1',
    actorDisplayName: '사용자1',
    action: 'UPDATE',
    diff: {},
    occurredAt: '2026-07-10T00:00:00.000Z',
    ...partial,
  };
}
function cmt(partial: Partial<RawCommentRow> & { id: string }): RawCommentRow {
  return {
    nodeId: 'n1',
    authorId: 'u1',
    authorUsername: 'user1',
    authorDisplayName: '사용자1',
    body: '댓글',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    ...partial,
  };
}

describe('selectHistoryByTopic', () => {
  const rows: RawHistoryRow[] = [
    hist({ id: 'a', action: 'UPDATE', diff: { progress: { from: 80, to: 50 } } }),
    hist({ id: 'b', action: 'UPDATE', diff: { progress: { from: 50, to: 80 } } }),
    hist({ id: 'c', action: 'DELETE', diff: {} }),
    hist({ id: 'd', action: 'UPDATE', diff: { endAt: { from: '2026-01-01', to: '2026-02-01' } } }),
  ];
  it('PROGRESS_DOWN 은 진행률 내림만', () => {
    expect(selectHistoryByTopic(rows, 'PROGRESS_DOWN').map(r => r.id)).toEqual(['a']);
  });
  it('DELETED 은 삭제만', () => {
    expect(selectHistoryByTopic(rows, 'DELETED').map(r => r.id)).toEqual(['c']);
  });
  it('PERIOD_CHANGE 는 기간 변경만', () => {
    expect(selectHistoryByTopic(rows, 'PERIOD_CHANGE').map(r => r.id)).toEqual(['d']);
  });
  it('ALL 은 전부', () => {
    expect(selectHistoryByTopic(rows, 'ALL')).toHaveLength(4);
  });
  it('COMMENTS 는 이력 없음', () => {
    expect(selectHistoryByTopic(rows, 'COMMENTS')).toHaveLength(0);
  });
});

describe('buildProjectHistory', () => {
  const meta = new Map<string, NodeMeta>([
    ['n1', { title: '살아있는 일정', deleted: false }],
    ['n2', { title: '지워진 일정', deleted: true }],
  ]);

  it('ALL 은 이력과 댓글을 시간 역순으로 병합', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', occurredAt: '2026-07-10T00:00:00.000Z' })],
      comments: [cmt({ id: 'c1', createdAt: '2026-07-11T00:00:00.000Z' })],
      meta,
      topic: 'ALL',
      limit: 500,
    });
    expect(res.items.map(i => i.type)).toEqual(['COMMENT', 'HISTORY']); // 최신(댓글)이 먼저
    expect(res.truncated).toBe(false);
  });

  it('COMMENTS 는 댓글만', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a' })],
      comments: [cmt({ id: 'c1' })],
      meta,
      topic: 'COMMENTS',
      limit: 500,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.type).toBe('COMMENT');
  });

  it('삭제된 노드는 nodeDeleted=true 와 복원 제목을 싣는다', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', nodeIdSnapshot: 'n2', action: 'DELETE' })],
      comments: [],
      meta,
      topic: 'DELETED',
      limit: 500,
    });
    expect(res.items[0]).toMatchObject({ type: 'HISTORY', nodeDeleted: true, nodeTitle: '지워진 일정' });
  });

  it('meta 에 없는 노드는 nodeDeleted=true + 기본 제목', () => {
    const res = buildProjectHistory({
      history: [hist({ id: 'a', nodeIdSnapshot: 'nX' })],
      comments: [],
      meta,
      topic: 'ALL',
      limit: 500,
    });
    expect(res.items[0]).toMatchObject({ nodeDeleted: true, nodeTitle: '(제목 없음)' });
  });

  it('limit 초과 시 잘라내고 truncated=true', () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      hist({ id: `h${i}`, occurredAt: `2026-07-0${i + 1}T00:00:00.000Z` }),
    );
    const res = buildProjectHistory({ history, comments: [], meta, topic: 'ALL', limit: 3 });
    expect(res.items).toHaveLength(3);
    expect(res.truncated).toBe(true);
    expect(res.items[0]!.type === 'HISTORY' && res.items[0]!.occurredAt).toBe('2026-07-05T00:00:00.000Z'); // 최신부터
  });
});

describe('ProjectHistoryQuery', () => {
  it('빈 입력이면 기본값 topic=ALL, range=1m', () => {
    const parsed = ProjectHistoryQuery.parse({});
    expect(parsed.topic).toBe('ALL');
    expect(parsed.range).toBe('1m');
  });
  it('custom 인데 from/to 없으면 실패', () => {
    expect(ProjectHistoryQuery.safeParse({ range: 'custom' }).success).toBe(false);
  });
  it('custom + from > to 이면 실패', () => {
    expect(
      ProjectHistoryQuery.safeParse({ range: 'custom', from: '2026-07-10', to: '2026-07-01' }).success,
    ).toBe(false);
  });
  it('custom + 올바른 from/to 는 성공', () => {
    const r = ProjectHistoryQuery.safeParse({ range: 'custom', from: '2026-07-01', to: '2026-07-10' });
    expect(r.success).toBe(true);
  });
  it('알 수 없는 topic 은 실패', () => {
    expect(ProjectHistoryQuery.safeParse({ topic: 'NOPE' }).success).toBe(false);
  });
});
