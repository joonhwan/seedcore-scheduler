const LINE = '====================================================';

/**
 * 미적용 마이그레이션이 있어 서버를 시작하지 않을 때 관리자에게 보여줄 안내.
 *
 * 관리자는 cmd.exe / wt.exe 에서 sp-server.exe 를 실행하고, 이 안내가 나오는 시점에
 * 프로세스는 이미 종료되어 프롬프트로 돌아가 있다. 그래서 "창을 닫으라" 가 아니라
 * 다음에 칠 명령을 그대로 보여준다. '>' 표기는 README-exe.txt 관례를 따른다.
 */
export function formatPendingMigrationsNotice(pending: string[]): string {
  const list = pending.map((name) => `    - ${name}`).join('\n');
  return [
    LINE,
    '  데이터베이스 업그레이드가 필요합니다',
    LINE,
    '',
    `  적용되지 않은 변경사항 ${pending.length}건:`,
    list,
    '',
    '  DB 는 변경하지 않았습니다. 서버도 시작하지 않았습니다.',
    '  아래 두 명령을 차례로 실행하십시오.',
    '',
    '    > sp-migrate.exe        DB 를 백업한 뒤 업그레이드합니다',
    '    > sp-server.exe         업그레이드가 끝나면 서버를 시작합니다',
    '',
    LINE,
  ].join('\n');
}

/**
 * 테이블은 있는데 _prisma_migrations 가 없는 DB. 구버전 ensureSchema() 가 만든 것으로,
 * 어디까지 적용된 상태인지 알 수 없어 잘못 재적용하면 데이터가 날아간다.
 */
export function formatLegacySchemaNotice(): string {
  return [
    LINE,
    '  이 데이터베이스는 업그레이드할 수 없습니다',
    LINE,
    '',
    '  마이그레이션 이력 테이블(_prisma_migrations)이 없습니다.',
    '  구버전에서 만들어진 DB 로 보이며, 어디까지 적용된 상태인지 확인할 수 없습니다.',
    '  잘못 적용하면 데이터가 손실될 수 있어 지원하지 않습니다.',
    '',
    '  담당 개발자에게 이 메시지를 그대로 전달하십시오.',
    '',
    LINE,
  ].join('\n');
}

/**
 * DB 에 기록된 마이그레이션이 exe 내장 파일 목록에 없는 상태.
 * 폐쇄망에서는 구버전 exe 가 USB 로 돌아다니다 최신 DB 에 붙는 일이 실제로 생긴다.
 */
export function formatDowngradeNotice(missing: string[]): string {
  const list = missing.map((name) => `    - ${name}`).join('\n');
  return [
    LINE,
    '  실행 파일이 데이터베이스보다 구버전입니다',
    LINE,
    '',
    '  DB 에는 적용되어 있으나 이 실행 파일이 알지 못하는 변경사항이 있습니다:',
    list,
    '',
    '  더 최신 버전의 sp-server.exe 로 실행하십시오.',
    '  DB 는 변경하지 않았습니다.',
    '',
    LINE,
  ].join('\n');
}

/**
 * 실행 파일에 내장되어야 할 migrations 디렉터리가 비어 있는 상태.
 * DB 문제가 아니라 설치 파일 자체가 손상되었거나 잘못 배포된 것이다.
 * sp-migrate.exe 는 여기서 적용할 대상이 없으므로 안내해도 소용이 없다.
 */
export function formatNoMigrationFilesNotice(): string {
  return [
    LINE,
    '  설치가 손상되었습니다',
    LINE,
    '',
    '  마이그레이션 파일을 찾을 수 없습니다.',
    '  실행 파일에 포함되어 있어야 할 데이터베이스 초기화 스크립트가 비어 있습니다.',
    '  설치 파일이 손상되었거나 잘못 배포된 것으로 보입니다.',
    '',
    '  sp-migrate.exe 를 실행해도 해결되지 않습니다 (적용할 마이그레이션 자체가 없습니다).',
    '  설치 파일을 다시 받아 재설치하십시오.',
    '  담당 개발자에게 이 메시지를 그대로 전달하십시오.',
    '',
    LINE,
  ].join('\n');
}

/**
 * 마이그레이션 이력에는 전부 적용된 것으로 기록되어 있는데, 정작 테이블이 하나도 없는 상태.
 * 손상된 백업을 복원했거나 DB 파일이 잘못 교체된 경우 생길 수 있다.
 * sp-migrate.exe 는 적용할 미적용분이 없으므로 여기서도 안내해도 소용이 없다.
 */
export function formatSchemaMissingNotice(): string {
  return [
    LINE,
    '  데이터베이스에 테이블이 없습니다',
    LINE,
    '',
    '  마이그레이션 이력에는 모두 적용된 것으로 기록되어 있지만, 정작 테이블은 하나도 없습니다.',
    '  손상된 백업을 복원했거나 데이터베이스 파일이 잘못 교체되었을 가능성이 있습니다.',
    '',
    '  데이터가 없는 상태로 서버를 시작하는 것은 위험하여 시작하지 않았습니다.',
    '  sp-migrate.exe 를 실행해도 해결되지 않습니다 (적용할 변경사항이 없습니다).',
    '  올바른 백업으로 복원하거나, 담당 개발자에게 이 메시지를 그대로 전달하십시오.',
    '',
    LINE,
  ].join('\n');
}

/**
 * 빈 DB 에 sp-server.exe 가 마이그레이션을 직접 적용하다가 중간에 실패한 상태.
 * 반쪽 스키마가 남아 있어 조용히 재시작하면 안 되고, DB 파일과 WAL/SHM 사이드카까지
 * 모두 지워야 한다 — WAL 은 마이그레이션 시작 전에 이미 켜 두었으므로 실패 시점에 남아 있고,
 * .db 파일만 지우면 SQLite 가 재시작 시 이 WAL 을 복구해 깨진 절반 스키마를 되살릴 수 있다.
 *
 * 이 상태에서 sp-migrate.exe 를 실행하면 안 된다. 다음 실행에서는 히스토리가 "미완료 마이그레이션
 * 있음"으로 보이지 않고 오히려 "테이블은 있고 미적용분도 있음" 상태로 보여 exit 3
 * (미적용 마이그레이션 안내, sp-migrate.exe 권유)로 착시를 일으킬 수 있다. 그 안내를 그대로
 * 따르면 이미 부분 실행된 CREATE TABLE 문이 다시 실행되어 또 실패한다. 그래서 이 안내는
 * "다음에 다른 안내가 나오더라도 이것부터 하라"고 미리 못박아 둔다.
 */
export function formatInitFailureNotice(detail: string, dbPath: string): string {
  return [
    LINE,
    '  데이터베이스 초기화에 실패했습니다',
    LINE,
    '',
    `  ${detail}`,
    '',
    '  아래 파일을 모두 삭제한 뒤 다시 실행하십시오.',
    `    - ${dbPath}`,
    `    - ${dbPath}-wal`,
    `    - ${dbPath}-shm`,
    '',
    '  이 상태에서는 sp-migrate.exe 를 실행해도 해결되지 않습니다.',
    '  다시 실행하면 "적용되지 않은 변경사항이 있습니다" 라는 다른 안내가 나올 수 있으나,',
    '  이미 절반만 적용된 상태라 그 안내를 따라도 다시 실패합니다.',
    '  위 파일을 모두 삭제하는 것이 유일한 해결 방법입니다.',
    '  계속 실패하면 담당 개발자에게 이 메시지를 그대로 전달하십시오.',
    '',
    LINE,
  ].join('\n');
}
