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
  formatLegacySchemaNotice,
  formatNoMigrationFilesNotice,
  formatPendingMigrationsNotice,
  formatSchemaMissingNotice,
} from './migration-messages';

export type BootDecision =
  | { kind: 'boot' }
  | { kind: 'apply'; names: string[] }
  | { kind: 'halt'; exitCode: number; notice: string };

/**
 * 부팅 시 DB 상태를 판정한다. 부작용이 없어 값으로 검증할 수 있다.
 *
 * - 테이블이 하나도 없는 새 DB: sp-server.exe 가 직접 적용한다. 잃을 데이터가 없는
 *   유일한 상태이고, README-exe.txt 가 안내하는 "최초 실행 시 자동 초기화" 1단계 UX 를 지킨다.
 * - 미적용분이 있는 기존 DB: DB 를 건드리지 않고 멈춘다. 적용은 sp-migrate.exe 가 한다.
 * - migrations 디렉터리가 비어 있거나(설치 손상), 이력상 전부 적용됐는데 테이블이 하나도
 *   없는 경우(백업 오복원 등)는 DB 상태가 아니라 설치/데이터 결함이므로 exit 6 으로 멈춘다.
 *   두 경우 모두 sp-migrate.exe 가 적용할 대상이 없어 안내해도 소용이 없다.
 */
export async function decideBoot(client: RawClient, dir: string): Promise<BootDecision> {
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
      return { kind: 'halt', exitCode: 6, notice: formatSchemaMissingNotice() };
    }
    return { kind: 'boot' };
  }

  if (await isFreshDatabase(client)) {
    return { kind: 'apply', names: pending };
  }

  return { kind: 'halt', exitCode: 3, notice: formatPendingMigrationsNotice(pending) };
}
