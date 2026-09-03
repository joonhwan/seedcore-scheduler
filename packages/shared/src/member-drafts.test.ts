import { describe, expect, it } from 'vitest';
import { countDraftRoles, mergeMemberDrafts, type MemberDraft } from './member-drafts';

function draft(userId: string, role: MemberDraft['role'] = 'MEMBER'): MemberDraft {
  return {
    userId,
    displayName: `이름-${userId}`,
    username: userId,
    role,
    inactive: false,
  };
}

describe('mergeMemberDrafts', () => {
  it('빈 명단에 담으면 그대로 들어간다', () => {
    expect(mergeMemberDrafts([], [draft('a'), draft('b')])).toEqual([draft('a'), draft('b')]);
  });

  it('이미 명단에 있는 사람은 역할을 보존한다', () => {
    const current = [draft('a', 'MANAGER')];
    const merged = mergeMemberDrafts(current, [draft('a', 'MEMBER')]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.role).toBe('MANAGER');
  });

  it('제외(null)로 둔 사람도 그대로 둔다 — 다시 담아도 되살아나지 않는다', () => {
    const merged = mergeMemberDrafts([draft('a', null)], [draft('a', 'MEMBER')]);
    expect(merged[0]!.role).toBeNull();
  });

  it('새 사람은 뒤에 붙인다', () => {
    const merged = mergeMemberDrafts([draft('a', 'MANAGER')], [draft('b')]);
    expect(merged.map((d) => d.userId)).toEqual(['a', 'b']);
  });

  it('담는 쪽에 같은 사람이 두 번 있어도 한 번만 들어간다', () => {
    const merged = mergeMemberDrafts([], [draft('a'), draft('a')]);
    expect(merged).toHaveLength(1);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const current = [draft('a')];
    mergeMemberDrafts(current, [draft('b')]);
    expect(current).toHaveLength(1);
  });
});

describe('countDraftRoles', () => {
  it('제외한 사람은 총원에서 뺀다', () => {
    const drafts = [draft('a', 'MANAGER'), draft('b', 'MEMBER'), draft('c', null)];
    expect(countDraftRoles(drafts)).toEqual({ total: 2, managers: 1, members: 1 });
  });

  it('빈 명단은 0', () => {
    expect(countDraftRoles([])).toEqual({ total: 0, managers: 0, members: 0 });
  });
});
