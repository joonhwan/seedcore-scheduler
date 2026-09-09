import { describe, expect, it } from 'vitest';
import { BulkRemoveMembersDto } from './index';

describe('BulkRemoveMembersDto', () => {
  it('아무도 고르지 않으면 거부한다', () => {
    expect(BulkRemoveMembersDto.safeParse({ userIds: [] }).success).toBe(false);
  });

  it('사용자 id 목록을 통과시킨다', () => {
    const parsed = BulkRemoveMembersDto.parse({ userIds: ['u1', 'u2'] });
    expect(parsed.userIds).toEqual(['u1', 'u2']);
  });
});
