import {
  DowngradeError,
  LegacySchemaError,
  isFreshDatabase,
  listApplied,
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
 * - migrations 디렉터리가 비어 있거나(설치 손상), 적용된 이력이 남아 있는데 테이블이 하나도
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

  const fresh = await isFreshDatabase(client);

  // "애플리케이션 테이블이 하나도 없다 + 적용 완료된 이력이 하나 이상 있다" 는 미적용분 개수와
  // 무관하게 손상된 상태다. 이 판정을 pending.length === 0 안쪽에만 두었을 때 실제로 나던 사고:
  // 오래된 .db 를 새 .db 위에 복원해 이력에는 완료 행이 남아 있고 테이블은 사라졌으며 새 exe 의
  // 미적용분도 있는 상태에서, 이 함수가 그 파일을 "최초 실행" 으로 보고 뒤쪽 마이그레이션만
  // 빈 파일에 적용해버렸다. 첫 "INSERT INTO new_x SELECT ... FROM x" 에서 죽고, 관리자는
  // exit 1 안내를 따라 DB 파일을 지운다. 같은 상태를 sp-migrate.exe 는 exit 2("비어 있으니
  // sp-server.exe 를 먼저 실행하라")로 진단했으니, 두 실행 파일이 서로 다른 말을 하고 있었다.
  //
  // 테이블 존재 여부가 아니라 `listApplied()` 로 판정하는 이유: ensureMigrationsTable() 직후
  // 첫 INSERT 전에 죽으면 빈 _prisma_migrations 테이블만 남는데, 그건 아직 아무것도 적용되지
  // 않은 진짜 최초 실행이다. 완료된 이력 행이 있는지로 물어야 그 경우를 손상으로 오진하지 않는다.
  if (fresh && (await listApplied(client)).length > 0) {
    return { kind: 'halt', exitCode: 6, notice: formatSchemaMissingNotice() };
  }

  if (pending.length === 0) {
    return { kind: 'boot' };
  }

  if (fresh) {
    return { kind: 'apply', names: pending };
  }

  return { kind: 'halt', exitCode: 3, notice: formatPendingMigrationsNotice(pending) };
}
