import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePreMigrateBackupPath, runMigrate, withSingleConnection } from './migrate-main';

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

describe('withSingleConnection', () => {
  it('쿼리스트링이 없으면 ? 로 connection_limit=1 을 붙인다', () => {
    expect(withSingleConnection('file:./data/app.db')).toBe(
      'file:./data/app.db?connection_limit=1',
    );
  });

  it('쿼리스트링이 이미 있으면 & 로 connection_limit=1 을 붙인다', () => {
    expect(withSingleConnection('file:./data/app.db?mode=rwc')).toBe(
      'file:./data/app.db?mode=rwc&connection_limit=1',
    );
  });
});

describe('runMigrate() 의 process.env.DATABASE_URL 오염 방지', () => {
  // override 1 의 두 번째 절반: connection_limit=1 은 PrismaClient 생성자에만 넘겨야 하고,
  // process.env.DATABASE_URL 에 섞이면 resolveDbFilePath() 를 쓰는 다른 코드가
  // '...?connection_limit=1' 로 끝나는 경로를 돌려주게 된다. 누군가 나중에 "코드 두 줄 정리"라며
  // withSingleConnection() 결과를 그대로 env 에 대입해버리는 회귀를 이 테스트가 잡는다.
  let tmpDir: string | undefined;
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('실행 후에도 DATABASE_URL 에 connection_limit 이 섞이지 않는다', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-env-'));
    const dbPath = path.join(tmpDir, 'app.db').replace(/\\/g, '/');
    const plainUrl = `file:${dbPath}`;
    process.env.DATABASE_URL = plainUrl;

    // 새 빈 DB 이므로 "sp-migrate.exe 가 손댈 대상이 아님" 판정(exit 2)으로 빨리 끝난다.
    // 목적은 그 판정 결과가 아니라, 실행 후 process.env.DATABASE_URL 이 오염되지 않았는지다.
    await runMigrate();

    expect(process.env.DATABASE_URL).toBe(plainUrl);
    expect(process.env.DATABASE_URL).not.toContain('connection_limit');
  });
});
