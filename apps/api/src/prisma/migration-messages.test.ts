import { describe, expect, it } from 'vitest';
import {
  formatDowngradeNotice,
  formatInitFailureNotice,
  formatLegacySchemaNotice,
  formatNoMigrationFilesNotice,
  formatPendingMigrationsNotice,
  formatSchemaMissingNotice,
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

describe('formatNoMigrationFilesNotice', () => {
  const notice = formatNoMigrationFilesNotice();

  it('설치가 손상되었다고 알린다', () => {
    expect(notice).toContain('설치가 손상되었습니다');
  });

  it('sp-migrate.exe 로 해결되지 않는다고 명시한다', () => {
    expect(notice).toContain('sp-migrate.exe 를 실행해도 해결되지 않습니다');
  });

  it('재설치를 안내한다', () => {
    expect(notice).toContain('재설치');
  });
});

describe('formatSchemaMissingNotice', () => {
  const notice = formatSchemaMissingNotice();

  it('테이블이 없다고 알린다', () => {
    expect(notice).toContain('테이블은 하나도 없습니다');
  });

  it('sp-migrate.exe 로 해결되지 않는다고 명시한다', () => {
    expect(notice).toContain('sp-migrate.exe 를 실행해도 해결되지 않습니다');
  });

  it('백업 복원 또는 개발자 문의를 안내한다', () => {
    expect(notice).toContain('백업으로 복원');
  });
});

describe('formatInitFailureNotice', () => {
  const notice = formatInitFailureNotice('테스트 실패 상세', 'D:/data/app.db');

  it('전달받은 실패 상세를 그대로 포함한다', () => {
    expect(notice).toContain('테스트 실패 상세');
  });

  it('전달받은 실제 DB 경로를 포함하고 하드코딩하지 않는다', () => {
    expect(notice).toContain('D:/data/app.db');
  });

  it('WAL/SHM 사이드카 파일까지 명시적으로 지목한다', () => {
    expect(notice).toContain('D:/data/app.db-wal');
    expect(notice).toContain('D:/data/app.db-shm');
  });

  it('sp-migrate.exe 로 해결되지 않는다고 명시한다', () => {
    expect(notice).toContain('sp-migrate.exe 를 실행해도 해결되지 않습니다');
  });
});
