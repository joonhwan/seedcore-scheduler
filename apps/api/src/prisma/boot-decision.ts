import {
  DowngradeError,
  LegacySchemaError,
  isFreshDatabase,
  listPending,
  type RawClient,
} from './migration-runner';
import {
  formatDowngradeNotice,
  formatLegacySchemaNotice,
  formatPendingMigrationsNotice,
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
 */
export async function decideBoot(client: RawClient, dir: string): Promise<BootDecision> {
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
    return { kind: 'boot' };
  }

  if (await isFreshDatabase(client)) {
    return { kind: 'apply', names: pending };
  }

  return { kind: 'halt', exitCode: 3, notice: formatPendingMigrationsNotice(pending) };
}
