import {
  DowngradeError,
  LegacySchemaError,
  isFreshDatabase,
  listMigrationFiles,
  listPending,
  type RawClient,
} from './migration-runner';
import {
  formatDowngradeNotice,
  formatEmptyDatabaseNotice,
  formatLegacySchemaNotice,
  formatNoMigrationFilesNotice,
  formatSchemaMissingNotice,
} from './migration-messages';

export type MigrateDecision =
  | { kind: 'up-to-date' }
  | { kind: 'apply'; names: string[] }
  | { kind: 'halt'; exitCode: number; notice: string };

/**
 * sp-migrate.exe 가 실행 시 DB 상태를 판정한다. 부작용이 없어 값으로 검증할 수 있다.
 * `boot-decision.ts` 의 `decideBoot()` 과 같은 모양과 같은 판정 순서를 따른다 — 서버 쪽 여섯
 * 가지 상태 판정이 한 곳에 모여 있어 테스트 가능하고 일관됐던 것과 같은 이유로, 여기서도
 * 판정과 I/O(백업/적용/출력)를 분리한다.
 *
 * 판정 순서가 `decideBoot()` 과 정확히 같아야 하는 이유: `isFreshDatabase()` 를
 * `listPending()` 보다 먼저 물으면, "이력엔 미래 마이그레이션이 기록돼 있지만 그 마이그레이션이
 * 만든 테이블은 없는" 다운그레이드 상태를 "이력은 있는데 테이블이 없는 손상된 복원" 으로 잘못
 * 분류해버린다(둘 다 isFreshDatabase() 는 true 를 준다). `listPending()` 을 먼저 불러 레거시/
 * 다운그레이드부터 가려낸 뒤에만 fresh 여부를 물어야 한다.
 *
 * `decideBoot()` 과 다른 점(sp-migrate.exe 전용 상태): `pending.length > 0` 인데 DB 가
 * fresh(테이블도 이력도 없음)이면, `decideBoot()` 은 'apply'(sp-server.exe 가 최초 초기화)를
 * 돌려주지만 여기서는 halt(exit 2)로 멈춘다 — 최초 초기화는 sp-server.exe 의 몫이지
 * sp-migrate.exe 가 손댈 대상이 아니기 때문이다.
 */
export async function decideMigrate(
  client: RawClient,
  dir: string,
  dbUrl: string,
): Promise<MigrateDecision> {
  const files = listMigrationFiles(dir);
  if (files.length === 0) {
    return { kind: 'halt', exitCode: 6, notice: formatNoMigrationFilesNotice() };
  }

  let pending: string[];
  try {
    pending = await listPending(client, dir);
  } catch (err) {
    if (err instanceof LegacySchemaError) {
      return { kind: 'halt', exitCode: 4, notice: formatLegacySchemaNotice() };
    }
    if (err instanceof DowngradeError) {
      return { kind: 'halt', exitCode: 5, notice: formatDowngradeNotice(err.missing) };
    }
    throw err;
  }

  if (pending.length === 0) {
    if (await isFreshDatabase(client)) {
      // 이력에는 전부 적용된 것으로 남아 있는데 테이블이 하나도 없다 — 손상된 백업 복원 등.
      // sp-server.exe 의 exit 6 (formatSchemaMissingNotice) 과 같은 상태이므로 같은 코드/문구를 쓴다.
      return { kind: 'halt', exitCode: 6, notice: formatSchemaMissingNotice() };
    }
    return { kind: 'up-to-date' };
  }

  if (await isFreshDatabase(client)) {
    // 이력도 없고 테이블도 없는 진짜 빈 DB. sp-migrate.exe 가 적용할 대상이 아니다.
    // (sp-server.exe 가 최초 실행 시 직접 초기화한다.)
    return { kind: 'halt', exitCode: 2, notice: formatEmptyDatabaseNotice(dbUrl) };
  }

  return { kind: 'apply', names: pending };
}
