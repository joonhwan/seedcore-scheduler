import { describe, it, expect } from 'vitest';
import { historyLabelText } from './historyView';

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
