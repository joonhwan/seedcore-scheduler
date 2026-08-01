import { describe, expect, it } from 'vitest';
import { AuditAction, CloneProjectDto } from './index';

const base = {
  name: '2호기',
  managerUserIds: ['u1'],
};

describe('CloneProjectDto', () => {
  it('KEEP 모드는 날짜 입력 없이 통과한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'KEEP' });
    expect(r.success).toBe(true);
  });

  it('memberUserIds 는 생략하면 빈 배열이 된다', () => {
    const r = CloneProjectDto.parse({ ...base, dateMode: 'KEEP' });
    expect(r.memberUserIds).toEqual([]);
  });

  it('MANAGER 가 0 명이면 거부한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, managerUserIds: [], dateMode: 'KEEP' });
    expect(r.success).toBe(false);
  });

  it('SHIFT 는 newStartDate 가 있어야 한다', () => {
    expect(CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT' }).success).toBe(false);
    expect(
      CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT', newStartDate: '2026-03-01' }).success,
    ).toBe(true);
  });

  it('SHIFT 는 newEndDate 를 요구하지 않는다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'SHIFT',
      newStartDate: '2026-03-01',
    });
    expect(r.success).toBe(true);
  });

  it('FIT 은 newStartDate 와 newEndDate 둘 다 있어야 한다', () => {
    expect(
      CloneProjectDto.safeParse({ ...base, dateMode: 'FIT', newStartDate: '2026-03-01' }).success,
    ).toBe(false);
    expect(
      CloneProjectDto.safeParse({
        ...base,
        dateMode: 'FIT',
        newStartDate: '2026-03-01',
        newEndDate: '2026-09-01',
      }).success,
    ).toBe(true);
  });

  it('FIT 에서 종료일이 시작일보다 앞서면 거부한다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'FIT',
      newStartDate: '2026-09-01',
      newEndDate: '2026-03-01',
    });
    expect(r.success).toBe(false);
  });

  it('FIT 에서 시작일과 종료일이 같은 날인 것은 허용한다', () => {
    const r = CloneProjectDto.safeParse({
      ...base,
      dateMode: 'FIT',
      newStartDate: '2026-09-01',
      newEndDate: '2026-09-01',
    });
    expect(r.success).toBe(true);
  });

  it('날짜 형식이 YYYY-MM-DD 가 아니면 거부한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'SHIFT', newStartDate: '2026/03/01' });
    expect(r.success).toBe(false);
  });

  it('description 은 null 을 허용한다', () => {
    const r = CloneProjectDto.safeParse({ ...base, dateMode: 'KEEP', description: null });
    expect(r.success).toBe(true);
  });
});

describe('AuditAction', () => {
  it('PROJECT_CLONE 을 포함한다', () => {
    expect(AuditAction.safeParse('PROJECT_CLONE').success).toBe(true);
  });
});
