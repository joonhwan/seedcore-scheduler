import { describe, expect, it } from 'vitest';
import {
  formatBackupFailedNotice,
  formatDowngradeNotice,
  formatEmptyDatabaseNotice,
  formatInitFailureNotice,
  formatLegacySchemaNotice,
  formatMigrateFailureNotice,
  formatNoMigrationFilesNotice,
  formatPendingMigrationsNotice,
  formatMigrateInProgressNotice,
  formatSchemaMissingNotice,
  formatServerAlreadyRunningNotice,
  formatServerRunningNotice,
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

describe('formatEmptyDatabaseNotice', () => {
  const notice = formatEmptyDatabaseNotice('file:./data/app.db');

  it('비어 있다고 알린다', () => {
    expect(notice).toContain('데이터베이스가 비어 있습니다');
  });

  it('전달받은 dbUrl 을 그대로 포함한다', () => {
    expect(notice).toContain('file:./data/app.db');
  });

  it('sp-server.exe 를 먼저 실행하라고 안내한다', () => {
    expect(notice).toContain('sp-server.exe');
    expect(notice).toContain('자동으로 만들어지고 초기화');
  });
});

describe('formatBackupFailedNotice', () => {
  const notice = formatBackupFailedNotice(
    'D:/backups/pre-migrate/sam_20260731_215740.db',
    'ENOTDIR: not a directory',
  );

  it('백업을 만들지 못했다고 알린다', () => {
    expect(notice).toContain('업그레이드 전 백업을 만들지 못했습니다');
  });

  it('전달받은 백업 경로와 원인 메시지를 그대로 포함한다', () => {
    expect(notice).toContain('D:/backups/pre-migrate/sam_20260731_215740.db');
    expect(notice).toContain('ENOTDIR: not a directory');
  });

  it('데이터베이스가 전혀 변경되지 않았다고 명시한다', () => {
    // 이 안내의 핵심: 백업 실패 시점엔 마이그레이션 적용이 아직 시작되지 않았으므로
    // DB 는 원래 상태 그대로다. 관리자가 백업을 찾아 헤매거나 반쪽 DB 를 걱정하지 않게 한다.
    expect(notice).toContain('데이터베이스는 전혀 변경되지 않았습니다');
  });

  it('원인 후보(디스크 공간/쓰기 권한/파일 충돌)를 안내한다', () => {
    expect(notice).toContain('디스크 여유 공간 부족');
    expect(notice).toContain('쓰기 권한');
    expect(notice).toContain('이미 존재');
  });

  it('원인 해결 후 sp-migrate.exe 재실행을 안내한다', () => {
    expect(notice).toContain('sp-migrate.exe 를 다시 실행하십시오');
  });
});

describe('formatMigrateFailureNotice', () => {
  const notice = formatMigrateFailureNotice({
    migrationName: '20260101000000_a',
    statementIndex: 2,
    causeMessage: 'near "THIS": syntax error',
    failingStatement: 'THIS IS NOT SQL;',
    succeeded: ['20250101000000_z'],
    backupPath: 'D:/backups/pre-migrate/sam_20260731_215740.db',
    dbPath: 'D:/data/app.db',
  });

  it('실패 지점(마이그레이션 이름과 문장 번호)을 포함한다', () => {
    expect(notice).toContain('20260101000000_a');
    expect(notice).toContain('2번째 문장');
  });

  it('원인 메시지를 포함하되 한 번만 담는다 (err.message 중복 금지)', () => {
    const occurrences = notice.split('near "THIS": syntax error').length - 1;
    expect(occurrences).toBe(1);
  });

  it('실패한 SQL 문장 원문을 포함한다', () => {
    expect(notice).toContain('THIS IS NOT SQL;');
  });

  it('이미 적용 완료된 마이그레이션 목록을 포함한다', () => {
    expect(notice).toContain('20250101000000_z');
  });

  it('적용 완료분이 없으면 그 사실을 명시한다', () => {
    const empty = formatMigrateFailureNotice({
      migrationName: '20260101000000_a',
      statementIndex: 1,
      causeMessage: 'boom',
      failingStatement: undefined,
      succeeded: [],
      backupPath: 'D:/backups/pre-migrate/sam_20260731_215740.db',
      dbPath: 'D:/data/app.db',
    });
    expect(empty).toContain('없음');
  });

  it('실패한 문장이 문장 배열 밖(이력 기록 단계)이면 그 사실을 설명한다', () => {
    const noStatement = formatMigrateFailureNotice({
      migrationName: '20260101000000_a',
      statementIndex: 1,
      causeMessage: 'boom',
      failingStatement: undefined,
      succeeded: [],
      backupPath: 'D:/backups/pre-migrate/sam_20260731_215740.db',
      dbPath: 'D:/data/app.db',
    });
    expect(noStatement).toContain('이력 기록 단계');
  });

  it('문장 번호를 특정할 수 없으면 억지 번호 대신 그 사실을 알린다', () => {
    // applyMigrations() 가 문장 실행 루프에 들어가기도 전에 실패한 경우
    // (ensureMigrationsTable / readMigrationSql). "0번째 문장" 같은 셀 수 없는 번호를
    // 보여주면 관리자가 파일에서 그 문장을 찾으려 헛수고를 한다.
    const unknown = formatMigrateFailureNotice({
      migrationName: '20260101000000_a',
      statementIndex: undefined,
      causeMessage: 'ENOENT: migration.sql',
      failingStatement: undefined,
      succeeded: ['20250101000000_z'],
      backupPath: 'D:/backups/pre-migrate/sam_20260731_215740.db',
      dbPath: 'D:/data/app.db',
    });
    expect(unknown).toContain('문장 번호를 특정할 수 없습니다');
    expect(unknown).not.toContain('번째 문장');
    // 복구에 필요한 정보(백업 경로, 지울 파일)는 그대로 나와야 한다.
    expect(unknown).toContain('D:/backups/pre-migrate/sam_20260731_215740.db');
    expect(unknown).toContain('D:/data/app.db-wal');
    expect(unknown).toContain('20250101000000_z');
  });

  it('긴 SQL 문장은 잘라서 보여준다', () => {
    const long = formatMigrateFailureNotice({
      migrationName: '20260101000000_a',
      statementIndex: 1,
      causeMessage: 'boom',
      failingStatement: 'X'.repeat(1000),
      succeeded: [],
      backupPath: 'D:/backups/pre-migrate/sam_20260731_215740.db',
      dbPath: 'D:/data/app.db',
    });
    expect(long).toContain('…(생략)');
    expect(long.length).toBeLessThan(1000 + 500);
  });

  it('삭제할 파일로 DB 본체와 WAL/SHM 사이드카를 모두 지목한다', () => {
    expect(notice).toContain('D:/data/app.db');
    expect(notice).toContain('D:/data/app.db-wal');
    expect(notice).toContain('D:/data/app.db-shm');
  });

  it('복원할 백업 파일 경로를 포함한다', () => {
    expect(notice).toContain('D:/backups/pre-migrate/sam_20260731_215740.db');
  });

  it('담당 개발자에게 전달하라고 안내한다', () => {
    expect(notice).toContain('담당 개발자에게 이 메시지를 그대로 전달하십시오.');
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

describe('formatServerRunningNotice', () => {
  const notice = formatServerRunningNotice({
    pid: 4321,
    lockPath: 'D:/data/sp-server.lock',
  });

  it('서버가 아직 실행 중이라고 알리고 PID 를 보여준다', () => {
    expect(notice).toContain('sp-server.exe 가 아직 실행 중입니다');
    expect(notice).toContain('PID 4321');
  });

  it('DB 를 전혀 변경하지 않았음을 명시한다', () => {
    // 이 안내는 백업보다 먼저 나오므로 이 문장이 사실이어야 한다. 순서가 뒤바뀌면 거짓이 된다.
    expect(notice).toContain('데이터베이스는 전혀 변경되지 않았습니다');
  });

  it('백업으로도 되돌릴 수 없는 위험이라는 점을 알려준다', () => {
    expect(notice).toContain('백업으로도 되돌릴 수 없습니다');
  });

  it('서버를 종료한 뒤 다시 실행하라고 안내한다', () => {
    expect(notice).toContain('sp-server.exe 를 종료한 뒤 sp-migrate.exe 를 다시 실행하십시오.');
  });

  it('잠금 파일 경로와 삭제 탈출구를 함께 안내한다', () => {
    // PID 재사용으로 생존 판정이 거짓 양성을 낼 때 관리자에게 남는 유일한 수단이다.
    expect(notice).toContain('D:/data/sp-server.lock');
    expect(notice).toContain('이 파일을 지운 뒤 sp-migrate.exe 를 다시 실행하십시오.');
  });

  it('note 를 주면 참고 줄로 함께 보여주고, 주지 않으면 그 줄이 없다', () => {
    const withNote = formatServerRunningNotice({
      pid: 4321,
      lockPath: 'D:/data/sp-server.lock',
      note: '다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)',
    });
    expect(withNote).toContain('참고: 다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)');
    expect(notice).not.toContain('참고:');
  });
});

describe('formatServerAlreadyRunningNotice', () => {
  const notice = formatServerAlreadyRunningNotice({
    pid: 8080,
    lockPath: 'D:/data/sp-server.lock',
  });

  it('이미 서버가 실행 중이라고 알리고 PID 를 보여준다', () => {
    expect(notice).toContain('이미 sp-server.exe 가 실행 중입니다');
    expect(notice).toContain('PID 8080');
  });

  it('DB 를 전혀 변경하지 않았음을 명시한다', () => {
    expect(notice).toContain('데이터베이스는 전혀 변경되지 않았습니다');
  });

  it('실행 중인 서버를 그대로 쓰거나 종료 후 다시 실행하라고 안내한다', () => {
    expect(notice).toContain('이미 실행 중인 서버를 그대로 쓰십시오');
    expect(notice).toContain('sp-server.exe 를 다시 실행하십시오.');
  });

  it('서버 잠금 파일 경로와 삭제 탈출구를 함께 안내한다', () => {
    expect(notice).toContain('D:/data/sp-server.lock');
    expect(notice).toContain('이 파일을 지운 뒤 sp-server.exe 를 다시 실행하십시오.');
  });

  it('note 를 주면 참고 줄로 함께 보여준다', () => {
    const withNote = formatServerAlreadyRunningNotice({
      pid: 8080,
      lockPath: 'D:/data/sp-server.lock',
      note: '다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)',
    });
    expect(withNote).toContain('참고: 다른 사용자 권한으로 실행 중인 것으로 보입니다 (EPERM)');
    expect(notice).not.toContain('참고:');
  });
});

describe('formatMigrateInProgressNotice', () => {
  const notice = formatMigrateInProgressNotice({
    pid: 5150,
    lockPath: 'D:/data/sp-migrate.lock',
    retryCommand: 'sp-server.exe',
  });

  it('업그레이드가 진행 중이라고 알리고 PID 를 보여준다', () => {
    expect(notice).toContain('sp-migrate.exe 가 업그레이드를 진행 중입니다');
    expect(notice).toContain('PID 5150');
  });

  it('DB 를 변경하지 않았음을 명시한다', () => {
    expect(notice).toContain('데이터베이스는 이 프로그램이 전혀 변경하지 않았습니다');
  });

  it('진행 중인 업그레이드를 강제 종료하지 말고 기다리라고 경고한다', () => {
    // INSERT SELECT 와 DROP TABLE 사이에서 끊기면 스키마가 절반만 남는다.
    expect(notice).toContain('강제로 종료하거나 그 창을 닫지 마십시오');
    expect(notice).toContain('기다리십시오');
  });

  it('retryCommand 로 다시 실행할 실행 파일을 구분한다', () => {
    expect(notice).toContain('"업그레이드 완료" 가 표시된 뒤에 sp-server.exe 를 실행하십시오.');
    const forMigrate = formatMigrateInProgressNotice({
      pid: 5150,
      lockPath: 'D:/data/sp-migrate.lock',
      retryCommand: 'sp-migrate.exe',
    });
    expect(forMigrate).toContain(
      '"업그레이드 완료" 가 표시된 뒤에 sp-migrate.exe 를 실행하십시오.',
    );
  });

  it('탈출구를 쓰기 전에 실행 중인 창이 없는지 확인하라는 조건을 먼저 못박는다', () => {
    // "기다리라" 와 "지워라" 가 나란히 있으면, 참지 못한 관리자가 뒷부분만 읽고 진행 중인
    // 업그레이드를 끊을 수 있다.
    const escapeIndex = notice.indexOf('이 파일을 지운 뒤');
    const guardIndex = notice.indexOf('실행 중인 sp-migrate.exe 창이 하나도 없는 것을 확인한 뒤에만');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(escapeIndex);
  });

  it('탈출구는 마이그레이션 잠금 파일 경로를 가리키고, 다시 실행할 대상도 맞춘다', () => {
    expect(notice).toContain('D:/data/sp-migrate.lock');
    expect(notice).toContain('sp-migrate.exe 를 이미 종료한 것이 확실하다면');
    expect(notice).toContain('이 파일을 지운 뒤 sp-server.exe 를 다시 실행하십시오.');
  });
});
