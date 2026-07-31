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
 * sp-migrate.exe 가 판정 결과 진짜 빈 DB(테이블도 이력도 없음)를 만난 상태.
 * 이 상태는 sp-migrate.exe 가 손댈 대상이 아니다 — 최초 초기화는 sp-server.exe 몫이다.
 *
 * dbUrl 을 그대로 보여준다. resolveDbFilePath() 는 'file:' 접두어만 벗기고 상대경로는
 * 그대로 두는데, DATABASE_URL 이 상대경로(예: "file:./data/app.db")이면 Node 와 Prisma 가
 * 서로 다른 기준 디렉터리로 해석해 실제로 연 파일과 다른 경로를 보여줄 위험이 있다. dbUrl 은
 * Prisma 에게 그대로 넘긴 값이라 그런 위험이 없다.
 */
export function formatEmptyDatabaseNotice(dbUrl: string): string {
  return [
    LINE,
    '  데이터베이스가 비어 있습니다',
    LINE,
    '',
    '  아직 초기화되지 않은 새 데이터베이스입니다 (테이블이 하나도 없습니다).',
    `  DB: ${dbUrl}`,
    '',
    '  sp-migrate.exe 는 여기서 할 일이 없습니다 (적용할 변경사항이 아니라 최초 초기화 대상입니다).',
    '  먼저 sp-server.exe 를 실행하면 데이터베이스가 자동으로 만들어지고 초기화됩니다.',
    '',
    LINE,
  ].join('\n');
}

/**
 * 잠금 파일 삭제 탈출구 안내 (아래 세 안내가 공유한다).
 *
 * 윈도우는 PID 를 재사용하므로, 강제 종료로 남은 낡은 잠금 파일의 PID 가 이미 다른 프로그램에게
 * 배정되어 있으면 생존 판정이 거짓 양성을 낸다. 그때 이 탈출구가 없으면 정상적인 실행이 영구히
 * 막혀버린다 — 폐쇄망에는 원격으로 손봐줄 사람이 없다. 그래서 **잠금 파일마다 정확히 그 파일의**
 * 경로를 보여줘야 한다 (서버 잠금과 마이그레이션 잠금은 다른 파일이다).
 *
 * `ownerName` 은 그 잠금을 남긴 실행 파일 이름이고, `retryCommand` 는 관리자가 다시 실행할
 * 실행 파일 이름이다. 둘이 다른 경우가 있어 인자를 나눠 받는다 (예: 업그레이드 중이라 서버를
 * 시작하지 못한 경우 — 남긴 쪽은 sp-migrate.exe, 다시 실행할 쪽은 sp-server.exe).
 */
function staleLockEscapeLines(params: {
  ownerName: string;
  lockPath: string;
  retryCommand: string;
}): string[] {
  const { ownerName, lockPath, retryCommand } = params;
  return [
    `  ${ownerName} 를 이미 종료한 것이 확실하다면, 아래 파일이 지워지지 않고 남은 것입니다.`,
    '  (강제 종료나 콘솔 창을 그냥 닫은 경우 이렇게 남습니다.)',
    `  이 파일을 지운 뒤 ${retryCommand} 를 다시 실행하십시오.`,
    '',
    `    ${lockPath}`,
  ];
}

/**
 * sp-server.exe 가 아직 실행 중인 상태에서 sp-migrate.exe 를 실행한 경우.
 *
 * 이 안내는 백업보다도 **먼저** 나온다. 그래야 "데이터베이스는 전혀 변경되지 않았습니다" 가
 * 사실이 된다 (process-lock.ts 의 파일 앞머리 주석에 위험의 전모가 적혀 있다:
 * 마이그레이션은 트랜잭션을 쓰지 않아 문장 단위로 커밋되고, INSERT SELECT 와 DROP TABLE 사이에
 * 서버가 커밋한 편집은 사전 백업에도 없어 되돌릴 방법이 없다).
 */
export function formatServerRunningNotice(params: {
  pid: number;
  lockPath: string;
  note?: string;
}): string {
  const { pid, lockPath, note } = params;
  const lines = [
    LINE,
    '  sp-server.exe 가 아직 실행 중입니다',
    LINE,
    '',
    `  실행 중으로 보이는 서버 프로세스: PID ${pid}`,
  ];
  if (note !== undefined) {
    lines.push(`  참고: ${note}`);
  }
  lines.push(
    '',
    '  서버가 켜진 채로 업그레이드하면 그 사이에 사용자가 저장한 내용이 사라질 수 있고,',
    '  업그레이드 직전에 만드는 백업으로도 되돌릴 수 없습니다.',
    '  그래서 아무 작업도 하지 않고 멈췄습니다. 데이터베이스는 전혀 변경되지 않았습니다.',
    '',
    '  sp-server.exe 를 종료한 뒤 sp-migrate.exe 를 다시 실행하십시오.',
    '',
    ...staleLockEscapeLines({
      ownerName: 'sp-server.exe',
      lockPath,
      retryCommand: 'sp-migrate.exe',
    }),
    '',
    LINE,
  );
  return lines.join('\n');
}

/**
 * 이미 sp-server.exe 가 실행 중인데 sp-server.exe 를 또 실행한 경우.
 *
 * 이 검사가 없을 때의 동작이 특히 나빴다: 두 번째 서버는 3000번 포트 바인딩에서 EADDRINUSE 로
 * 죽는데, 그 실패가 처리되지 않은 Promise 거부로 새어나가 영문 스택 트레이스만 남기고 exit 1 로
 * 끝났다. README-exe.txt 의 종료 코드 표에서 exit 1 은 "DB 파일을 지워야 할 수도 있는 상태" 와
 * 묶여 있어, 관리자가 이 화면을 보고 DB 를 지우는 최악의 오조작으로 이어질 수 있었다.
 * 그래서 Nest 를 띄우기도 전에 이 안내를 주고 exit 7 로 끝낸다.
 */
export function formatServerAlreadyRunningNotice(params: {
  pid: number;
  lockPath: string;
  note?: string;
}): string {
  const { pid, lockPath, note } = params;
  const lines = [
    LINE,
    '  이미 sp-server.exe 가 실행 중입니다',
    LINE,
    '',
    `  실행 중으로 보이는 서버 프로세스: PID ${pid}`,
  ];
  if (note !== undefined) {
    lines.push(`  참고: ${note}`);
  }
  lines.push(
    '',
    '  서버는 한 번에 하나만 실행할 수 있습니다. 하나의 데이터베이스를 두 서버가 함께 고치면',
    '  데이터가 어긋날 수 있어, 이 서버는 시작하지 않았습니다.',
    '  데이터베이스는 전혀 변경되지 않았습니다.',
    '',
    '  이미 실행 중인 서버를 그대로 쓰십시오. 브라우저에서 접속되지 않는다면 그 서버를 먼저',
    '  종료한 뒤 sp-server.exe 를 다시 실행하십시오.',
    '',
    ...staleLockEscapeLines({
      ownerName: 'sp-server.exe',
      lockPath,
      retryCommand: 'sp-server.exe',
    }),
    '',
    LINE,
  );
  return lines.join('\n');
}

/**
 * sp-migrate.exe 가 업그레이드를 진행하는 중에 sp-server.exe 나 sp-migrate.exe 를 실행한 경우.
 *
 * 관리자가 여기서 할 수 있는 최악의 선택이 "안 끝나는 것 같으니 창을 닫는" 것이다. 마이그레이션은
 * 트랜잭션 없이 문장 단위로 커밋되므로, INSERT SELECT 와 DROP TABLE 사이에서 끊기면 스키마가
 * 절반만 적용된 상태로 남는다 (설계 문서 6절). 그래서 이 문구는 "기다리라, 끝내게 두라" 를
 * 명시적으로 말한다.
 *
 * `retryCommand` 로 다시 실행할 실행 파일을 구분한다 — 서버를 시작하려던 관리자에게
 * "sp-migrate.exe 를 다시 실행하라" 고 말하면 안 된다.
 */
export function formatMigrateInProgressNotice(params: {
  pid: number;
  lockPath: string;
  retryCommand: string;
  note?: string;
}): string {
  const { pid, lockPath, retryCommand, note } = params;
  const lines = [
    LINE,
    '  sp-migrate.exe 가 업그레이드를 진행 중입니다',
    LINE,
    '',
    `  실행 중으로 보이는 업그레이드 프로세스: PID ${pid}`,
  ];
  if (note !== undefined) {
    lines.push(`  참고: ${note}`);
  }
  lines.push(
    '',
    '  업그레이드 도중에 다른 프로그램이 같은 데이터베이스를 건드리면 데이터가 사라질 수 있어,',
    '  아무 작업도 하지 않고 멈췄습니다. 데이터베이스는 이 프로그램이 전혀 변경하지 않았습니다.',
    '',
    '  ※ 진행 중인 sp-migrate.exe 를 강제로 종료하거나 그 창을 닫지 마십시오.',
    '     업그레이드는 도중에 끊기면 스키마가 절반만 바뀐 상태로 남습니다. 끝날 때까지',
    '     기다리십시오 (보통 수 초 ~ 수십 초).',
    '',
    `  "업그레이드 완료" 가 표시된 뒤에 ${retryCommand} 를 실행하십시오.`,
    '',
    // 위에서 "죽이지 말고 기다려라" 고 해 놓고 바로 "이 파일을 지워라" 를 붙이면, 참지 못한
    // 관리자가 뒷부분만 읽고 진행 중인 업그레이드를 끊어버릴 수 있다. 조건을 먼저 못박는다.
    '  ※ 아래는 sp-migrate.exe 가 실제로는 돌고 있지 않은 경우에만 해당합니다.',
    '     실행 중인 sp-migrate.exe 창이 하나도 없는 것을 확인한 뒤에만 하십시오.',
    '',
    ...staleLockEscapeLines({
      ownerName: 'sp-migrate.exe',
      lockPath,
      retryCommand,
    }),
    '',
    LINE,
  );
  return lines.join('\n');
}

/**
 * sp-migrate.exe 가 업그레이드 전 백업(`snapshotTo()`, 또는 그 대상 폴더를 만드는
 * `fs.mkdirSync()`) 자체를 만들지 못한 상태.
 *
 * 이 실패는 마이그레이션을 적용하기 **전**에 일어난다 — `applyMigrations()` 호출 자체가
 * 시작되지 않았으므로 DB 는 아무 것도 바뀌지 않은 상태 그대로다. 관리자가 가장 걱정할
 * "DB 가 반쯤 망가졌나?" 라는 질문에 답을 먼저 주는 것이 이 안내의 핵심이다 — 그래야
 * 있지도 않은 백업을 찾아 헤매거나 불필요하게 재설치를 시도하지 않는다.
 *
 * causeMessage 만 보여주고 원문 스택 트레이스를 노출하지 않는 이유는
 * formatMigrateFailureNotice() 와 같다: 관리자가 읽고 다음 행동을 정할 수 있는
 * 요약이면 충분하고, 실제 원인 분류(디스크 공간/권한/파일 충돌)는 아래 목록으로 안내한다.
 */
export function formatBackupFailedNotice(backupPath: string, causeMessage: string): string {
  return [
    LINE,
    '  업그레이드 전 백업을 만들지 못했습니다',
    LINE,
    '',
    `  백업 경로: ${backupPath}`,
    `  원인: ${causeMessage}`,
    '',
    '  백업이 실패했으므로 업그레이드를 진행하지 않았습니다.',
    '  데이터베이스는 전혀 변경되지 않았습니다.',
    '',
    '  주로 다음 중 하나가 원인입니다.',
    '    - 디스크 여유 공간 부족',
    '    - backups/pre-migrate/ 폴더에 쓰기 권한 없음',
    '    - 같은 이름의 백업 파일이 이미 존재함',
    '',
    '  원인을 해결한 뒤 sp-migrate.exe 를 다시 실행하십시오.',
    '',
    LINE,
  ].join('\n');
}

/**
 * sp-migrate.exe 가 마이그레이션 적용 도중 실패한 상태.
 *
 * 이 실행 파일이 하는 유일한 쓰기 작업이 실패한 것이므로, 관리자가 다음 두 가지를
 * 스스로 판단할 수 있어야 한다: (1) DB 가 지금 어디까지 적용된 상태인지, (2) 백업으로
 * 되돌릴 때 무엇을 지워야 하는지. `succeeded` 로 (1)을, `dbPath` 로 (2)를 채운다.
 *
 * `dbPath` 는 실제 파일 경로(문자열, fs 판단에는 쓰지 않는다) — formatInitFailureNotice() 와
 * 같은 이유로 WAL/SHM 사이드카까지 나란히 지목해야 한다. runMigrate() 가 이미
 * `PRAGMA journal_mode=WAL` 을 걸어 두었으므로 실패 시점에 `${dbPath}-wal` 이 존재하며,
 * 거기에 커밋된 절반만 적용된 페이지가 남아 있다. 그 WAL 을 지우지 않고 백업 파일만
 * `.db` 위에 덮어쓰면 SQLite 가 재시작 시 이 WAL 을 엉뚱한 DB 이미지에 재적용해 백업이
 * 오염되거나 절반짜리 스키마가 되살아난다 — 실패 시 유일한 복구 수단인 백업 자체가
 * 무력화되는 것이므로 반드시 셋 다 지우라고 명시한다.
 *
 * causeMessage 만 쓰고 err.message 전체를 쓰지 않는 이유: MigrationFailedError.message 는
 * 이미 "마이그레이션 'X' 의 Y번째 문장에서 실패했습니다: <원인>" 형태라, 아래에서
 * migrationName/statementIndex 를 따로 한 번 더 보여주면 같은 문장을 두 번 읽게 된다.
 *
 * `statementIndex` 가 `undefined` 인 경우: `applyMigrations()` 가 문장 실행 루프에 들어가기도
 * 전에(이력 테이블 생성, migration.sql 파일 읽기) 실패하면 지목할 문장 번호가 없다. 그때
 * 억지로 0 이나 1 을 쓰면 "0번째 문장" 처럼 셀 수 없는 번호이거나, 실행된 적도 없는 첫
 * 문장을 원인으로 지목하는 셈이 된다. 번호를 특정할 수 없다고 그대로 말한다.
 */
export function formatMigrateFailureNotice(params: {
  migrationName: string;
  statementIndex: number | undefined;
  causeMessage: string;
  failingStatement: string | undefined;
  succeeded: string[];
  backupPath: string;
  dbPath: string;
}): string {
  const { migrationName, statementIndex, causeMessage, failingStatement, succeeded, backupPath, dbPath } =
    params;

  const MAX_STATEMENT_LEN = 300;
  const truncatedStatement =
    failingStatement === undefined
      ? '(마이그레이션 SQL 문장이 아니라 이력 기록 단계 자체에서 실패했습니다)'
      : failingStatement.length > MAX_STATEMENT_LEN
        ? `${failingStatement.slice(0, MAX_STATEMENT_LEN)} …(생략)`
        : failingStatement;

  const succeededList =
    succeeded.length === 0
      ? '    없음 — 이번 실행에서 하나도 적용되지 못했습니다.'
      : succeeded.map((name) => `    - ${name}`).join('\n');

  const failurePoint =
    statementIndex === undefined
      ? `  실패 지점: ${migrationName} (문장 번호를 특정할 수 없습니다)`
      : `  실패 지점: ${migrationName} 의 ${statementIndex}번째 문장`;

  return [
    LINE,
    '  업그레이드가 실패했습니다',
    LINE,
    '',
    failurePoint,
    `  원인: ${causeMessage}`,
    `  실패한 문장: ${truncatedStatement}`,
    '',
    '  이번 실행에서 이미 적용 완료된 마이그레이션:',
    succeededList,
    '',
    '  DB 가 중간 상태일 수 있습니다. 아래 파일을 모두 삭제한 뒤 백업 파일로 되돌리십시오.',
    '',
    '    삭제할 파일:',
    `      - ${dbPath}`,
    `      - ${dbPath}-wal`,
    `      - ${dbPath}-shm`,
    '',
    '    복원할 백업 파일:',
    `      - ${backupPath}`,
    '',
    '  담당 개발자에게 이 메시지를 그대로 전달하십시오.',
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
