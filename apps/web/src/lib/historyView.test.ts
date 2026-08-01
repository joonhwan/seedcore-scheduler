import { describe, it, expect } from 'vitest';
import { historyLabelText, clonedFromText } from './historyView';

describe('historyLabelText', () => {
  it('진행률 내림', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 80, to: 50 } })).toBe('진행률 80% → 50%');
  });
  it('진행률 올림', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 50, to: 80 } })).toBe('진행률 50% → 80%');
  });
  it('진행률 100% 완료', () => {
    expect(historyLabelText('UPDATE', { progress: { from: 90, to: 100 } })).toBe('진행률 100%');
  });
  it('기간 변경(endAt)', () => {
    expect(historyLabelText('UPDATE', { endAt: { from: '2026-01-31', to: '2026-02-15' } })).toBe(
      '기간 2026-01-31 → 2026-02-15',
    );
  });
  it('제목 변경', () => {
    expect(historyLabelText('UPDATE', { title: { from: '구설계', to: '신설계' } })).toBe(
      '제목 "구설계" → "신설계"',
    );
  });
  it('생성/삭제/이동/복구', () => {
    expect(historyLabelText('CREATE', {})).toBe('생성');
    expect(historyLabelText('DELETE', {})).toBe('삭제');
    expect(historyLabelText('MOVE', {})).toBe('위치 이동');
    expect(historyLabelText('RESTORE', {})).toBe('복구');
  });
});

describe('clonedFromText', () => {
  it('clonedFrom 이 있으면 복제 안내 문구를 돌려준다', () => {
    expect(
      clonedFromText({ clonedFrom: { projectId: 'p1', nodeId: 'n1' } }),
    ).toBe('다른 프로젝트에서 복제되어 생성됨');
  });

  it('clonedFrom 이 없으면 null 이다', () => {
    expect(clonedFromText({})).toBeNull();
    expect(clonedFromText({ title: { from: 'a', to: 'b' } })).toBeNull();
  });
});
