import { describe, expect, it } from 'vitest';
import { resolvePreMigrateBackupPath } from './migrate-main';

describe('resolvePreMigrateBackupPath', () => {
  const at = new Date(2026, 6, 29, 21, 5, 3); // 2026-07-29 21:05:03 (월은 0-based)

  it('backups/pre-migrate 아래에 만든다', () => {
    const p = resolvePreMigrateBackupPath(at).replace(/\\/g, '/');
    expect(p).toContain('/backups/pre-migrate/');
  });

  it('sam_YYYYMMDD_HHMMSS.db 형식이다', () => {
    expect(resolvePreMigrateBackupPath(at)).toMatch(/sam_20260729_210503\.db$/);
  });
});
