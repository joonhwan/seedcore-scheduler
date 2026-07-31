import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyMigrations } from './prisma/migration-runner';
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

describe('runMigrate() 의 백업 실패 처리', () => {
  // I1: snapshotTo() 이전에 있던 fs.mkdirSync()/snapshotTo() 는 원래 try/catch 밖에 있어서,
  // 백업 자체가 실패하면(디스크 공간 부족, 쓰기 권한 없음, 동명 파일 존재 등) 최상위 catch 로 새어나가
  // 관리자에게 원문 스택 트레이스만 보여주고 "DB 는 안 건드렸다"는 사실을 알려주지 못했다.
  // 이 테스트는 그 실패를 실제로 재현해 exit 1 + 전용 안내 문구가 나오는지 확인한다.
  //
  // 백업 폴더 생성 자체를 확실히 실패시키기 위해, 임시 작업 디렉터리(cwd)에 "backups" 라는
  // 이름의 일반 파일을 미리 만들어 둔다. resolvePreMigrateBackupPath() 가 만드는 경로는
  // <cwd>/backups/pre-migrate/... 이므로, "backups" 가 디렉터리가 아니라 파일이면
  // fs.mkdirSync(..., { recursive: true }) 가 반드시 실패한다 (타임스탬프에 의존하지 않는
  // 결정적인 실패 재현 방법).
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let dbDir: string | undefined;
  let workDir: string | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    errorSpy?.mockRestore();
    if (dbDir) {
      fs.rmSync(dbDir, { recursive: true, force: true });
      dbDir = undefined;
    }
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('백업 생성이 실패하면 exit 1 이고, DB 를 건드리지 않았다는 전용 안내를 출력한다', async () => {
    // 실제 apps/api/prisma/migrations 를 그대로 쓴다 (migration-runner.test.ts 의
    // "실제 prisma/migrations 적용" describe 와 같은 패턴). 마지막 하나를 뺀 나머지를
    // 미리 적용해 두어야 decideMigrate() 가 'apply'(pending>0, 백업 필요)로 판정한다.
    const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
    const names = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(migrationsDir, e.name, 'migration.sql')))
      .map((e) => e.name)
      .sort();
    expect(names.length).toBeGreaterThan(1);

    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-backupfail-db-'));
    const dbPath = path.join(dbDir, 'app.db').replace(/\\/g, '/');

    const setupClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await setupClient.$connect();
    await applyMigrations(setupClient, migrationsDir, names.slice(0, names.length - 1));
    await setupClient.$disconnect();

    originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${dbPath}`;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-backupfail-cwd-'));
    fs.writeFileSync(path.join(workDir, 'backups'), 'block');
    process.chdir(workDir);

    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitCode = await runMigrate();

    expect(exitCode).toBe(1);
    const output = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('업그레이드 전 백업을 만들지 못했습니다');
    expect(output).toContain('데이터베이스는 전혀 변경되지 않았습니다');
    // 마이그레이션 적용 실패(formatMigrateFailureNotice) 문구가 섞여 나오면 안 된다 —
    // 이건 적용을 시작하기 전 단계의 실패이지, 적용 중 실패가 아니다.
    expect(output).not.toContain('업그레이드가 실패했습니다');
  });
});
