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
