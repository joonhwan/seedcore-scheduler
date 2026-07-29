import { describe, expect, it } from 'vitest';
import {
  formatDowngradeNotice,
  formatLegacySchemaNotice,
  formatPendingMigrationsNotice,
} from './migration-messages';

describe('formatPendingMigrationsNotice', () => {
  const notice = formatPendingMigrationsNotice([
    '20260801093000_add_attachment',
    '20260815112000_node_tags',
  ]);

  it('업그레이드가 필요하다고 알린다', () => {
    expect(notice).toContain('데이터베이스 업그레이드가 필요합니다');
  });

  it('미적용 건수와 이름을 모두 나열한다', () => {
    expect(notice).toContain('2건');
    expect(notice).toContain('20260801093000_add_attachment');
    expect(notice).toContain('20260815112000_node_tags');
  });

  it('DB 를 건드리지 않았음을 명시한다', () => {
    expect(notice).toContain('DB 는 변경하지 않았습니다');
  });

  it('다음에 실행할 두 명령을 프롬프트 표기로 보여준다', () => {
    expect(notice).toContain('> sp-migrate.exe');
    expect(notice).toContain('> sp-server.exe');
  });

  it('창을 닫으라는 안내를 쓰지 않는다', () => {
    // 관리자는 cmd.exe / wt.exe 에서 실행하며 프로세스는 이미 종료된 상태다.
    expect(notice).not.toContain('창을 닫');
  });
});

describe('formatLegacySchemaNotice', () => {
  it('이력 테이블이 없어 진행할 수 없다고 알린다', () => {
    const notice = formatLegacySchemaNotice();
    expect(notice).toContain('_prisma_migrations');
    expect(notice).toContain('지원하지 않습니다');
  });
});

describe('formatDowngradeNotice', () => {
  it('exe 가 DB 보다 구버전이라고 알린다', () => {
    const notice = formatDowngradeNotice(['20260901120000_future_change']);
    expect(notice).toContain('구버전');
    expect(notice).toContain('20260901120000_future_change');
  });
});
