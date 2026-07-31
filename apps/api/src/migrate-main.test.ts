import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { applyMigrations, listMigrationFiles, listPending } from './prisma/migration-runner';
import { resolveServerLockPath, writeServerLock } from './common/server-lock';
import { resolvePreMigrateBackupPath, runMigrate } from './migrate-main';

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

// withSingleConnection / createMigrationClient 의 단위 테스트는
// src/prisma/migration-client.test.ts 로 옮겼다 (그 함수들이 그 모듈로 옮겨졌다).

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

describe('runMigrate() 의 정상 업그레이드 경로', () => {
  // sp-migrate.exe 는 고객 DB 에 쓰기를 하는 유일한 실행 파일인데, 그 성공 경로
  // (판정 → 백업 → 적용 → 리포트)를 끝까지 실행하는 테스트가 없었다. 데이터가 들어 있는
  // DB 에 실제 마이그레이션 하나를 적용해 그 전체 경로를 통과시킨다.
  //
  // 가장 중요한 단언은 "백업이 적용보다 먼저" 다 (아래 4번). 트랜잭션을 쓰지 않는 이 설계에서
  // 원자성을 대신하는 것이 사전 백업이므로, 스냅샷이 적용 루프 뒤로 밀리는 리팩터링은
  // 무조건 잡아야 한다. 백업 파일 존재만 확인하면 그 회귀가 초록불로 통과한다.
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let dbDir: string | undefined;
  let workDir: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(async () => {
    // 임시 디렉터리를 지우기 전에 cwd 를 먼저 되돌린다. vitest.config.ts 가
    // fileParallelism: false 라 cwd 가 새면 뒤에 실행되는 모든 테스트 파일이 깨진다.
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    logSpy?.mockRestore();
    if (dbDir) {
      fs.rmSync(dbDir, { recursive: true, force: true });
      dbDir = undefined;
    }
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('데이터가 있는 DB 를 백업한 뒤 업그레이드하고 exit 0 을 돌려준다', async () => {
    const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
    const allNames = listMigrationFiles(migrationsDir);
    expect(allNames.length).toBeGreaterThan(1);
    const lastName = allNames[allNames.length - 1]!;
    const alreadyApplied = allNames.slice(0, allNames.length - 1);

    // 1) 마지막 하나를 뺀 나머지를 미리 적용하고 실제 데이터를 넣는다.
    //    (행 구성은 migration-runner.test.ts 의 데이터 보존 테스트와 같다.)
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-happy-db-'));
    const dbPath = path.join(dbDir, 'app.db').replace(/\\/g, '/');
    const setupClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await setupClient.$connect();
    await applyMigrations(setupClient, migrationsDir, alreadyApplied);
    await setupClient.$executeRawUnsafe(
      `INSERT INTO "users" ("id","username","display_name","password_hash","updated_at")
       VALUES ('u1','tester','Tester','hash','2026-01-01T00:00:00.000Z')`,
    );
    await setupClient.$executeRawUnsafe(
      `INSERT INTO "projects" ("id","name","created_by","updated_at")
       VALUES ('p1','Test Project','u1','2026-01-01T00:00:00.000Z')`,
    );
    await setupClient.$executeRawUnsafe(
      `INSERT INTO "schedule_nodes"
         ("id","project_id","parent_id","kind","title","sort_order","depth","created_by","updated_by","updated_at")
       VALUES ('n1','p1',NULL,'ITEM','Test Node',1,0,'u1','u1','2026-01-01T00:00:00.000Z')`,
    );
    await setupClient.$executeRawUnsafe(
      `INSERT INTO "node_comments" ("id","node_id","author_id","body","updated_at")
       VALUES ('c1','n1','u1','a comment','2026-01-01T00:00:00.000Z')`,
    );
    await setupClient.$disconnect();

    // 2) 그 파일을 대상으로, 백업이 떨어질 임시 작업 디렉터리에서 실행한다.
    originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${dbPath}`;
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-happy-cwd-'));
    process.chdir(workDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    // 3) 성공해야 한다.
    expect(await runMigrate()).toBe(0);

    // 4) 백업이 만들어졌고, 그 백업에는 이번에 적용한 마이그레이션이 **없어야** 한다.
    //    이것이 "백업은 적용보다 먼저" 를 증명하는 유일한 단언이다.
    const preMigrateDir = path.join(workDir, 'backups', 'pre-migrate');
    const backups = fs.readdirSync(preMigrateDir).filter((f) => /^sam_.*\.db$/.test(f));
    expect(backups).toHaveLength(1);
    const backupPath = path.join(preMigrateDir, backups[0]!).replace(/\\/g, '/');

    const backupClient = new PrismaClient({
      datasources: { db: { url: `file:${backupPath}?connection_limit=1` } },
    });
    try {
      const backupRows = await backupClient.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      );
      const backupNames = backupRows.map((r) => r.migration_name);
      expect(backupNames).not.toContain(lastName);
      expect(backupNames).toContain(alreadyApplied[alreadyApplied.length - 1]!);
    } finally {
      await backupClient.$disconnect();
    }

    // 5) 실제 DB: 미적용분 0, 기존 데이터 생존, FK 무결성 정상.
    const verifyClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    try {
      expect(await listPending(verifyClient, migrationsDir)).toEqual([]);

      const comments = await verifyClient.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "node_comments" WHERE id = 'c1'`,
      );
      expect(comments).toEqual([{ id: 'c1' }]);

      const violations = await verifyClient.$queryRawUnsafe<unknown[]>(`PRAGMA foreign_key_check`);
      expect(violations).toEqual([]);

      // 마이그레이션 SQL 이 껐던 FK 를 다시 켜 두는지 확인한다. foreign_keys 는 커넥션 단위
      // 설정이라 여기서 보는 값은 새 커넥션의 값이다 — 마이그레이션이 파일에 남긴 상태가
      // 아니라 "Prisma 커넥터가 연결 시 ON 으로 맞춘다" 는 사실을 확인하는 셈이지만,
      // 그 전제가 깨지면 앱 전체의 FK 가 조용히 꺼지는 것이므로 확인해 둘 값어치가 있다.
      const fk = await verifyClient.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>(
        `PRAGMA foreign_keys`,
      );
      expect(Number(fk[0]!.foreign_keys)).toBe(1);
    } finally {
      await verifyClient.$disconnect();
    }

    // 6) README 의 복구 안내가 화면에 찍힌 백업 경로에 의존하므로, 출력에 그 경로와
    //    완료 요약이 실제로 들어 있는지 확인한다.
    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output.replace(/\\/g, '/')).toContain(backupPath);
    expect(output).toContain('업그레이드 완료 — 1건 적용');
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

describe('runMigrate() 의 서버 실행 중 거부', () => {
  // 서버가 켜진 채로 마이그레이션을 적용하면, 트랜잭션을 쓰지 않는 이 설계에서는 INSERT SELECT 와
  // DROP TABLE 사이에 커밋된 사용자 편집이 사라진다. 사전 백업은 그 편집이 생기기 전에 떠 놓은
  // 것이라 복구 수단이 되지 못한다. 그래서 이 검사는 반드시 **백업보다 먼저** 있어야 한다 —
  // 아래에서 backups/ 폴더가 아예 만들어지지 않았음을 확인하는 것이 그 순서를 고정하는 단언이다.
  const originalCwd = process.cwd();
  let originalEnv: string | undefined;
  let dbDir: string | undefined;
  let workDir: string | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;
  let logSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    // 임시 디렉터리를 지우기 전에 cwd 를 되돌린다 (fileParallelism: false).
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv;
    }
    errorSpy?.mockRestore();
    logSpy?.mockRestore();
    if (dbDir) {
      fs.rmSync(dbDir, { recursive: true, force: true });
      dbDir = undefined;
    }
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it('살아 있는 PID 가 적힌 잠금이 있으면 exit 7 이고 백업조차 만들지 않는다', async () => {
    const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
    const names = listMigrationFiles(migrationsDir);
    expect(names.length).toBeGreaterThan(1);

    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-locked-db-'));
    const dbPath = path.join(dbDir, 'app.db').replace(/\\/g, '/');

    // 마지막 하나를 빼고 적용해 두어 decideMigrate() 가 'apply' 로 판정하게 만든다.
    const setupClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await setupClient.$connect();
    await applyMigrations(setupClient, migrationsDir, names.slice(0, names.length - 1));
    await setupClient.$disconnect();

    originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${dbPath}`;

    // 확실히 살아 있는 PID = 지금 이 테스트 프로세스 자신.
    writeServerLock(process.pid);
    expect(fs.existsSync(resolveServerLockPath())).toBe(true);

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-locked-cwd-'));
    process.chdir(workDir);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runMigrate()).toBe(7);

    const output = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('sp-server.exe 가 아직 실행 중입니다');
    expect(output).toContain(`PID ${process.pid}`);
    expect(output).toContain('데이터베이스는 전혀 변경되지 않았습니다');
    expect(output.replace(/\\/g, '/')).toContain(resolveServerLockPath().replace(/\\/g, '/'));

    // 백업 폴더가 생기지도 않았어야 한다 = 검사가 백업보다 먼저다.
    expect(fs.existsSync(path.join(workDir, 'backups'))).toBe(false);

    // 미적용분도 그대로 남아 있어야 한다 (적용을 시작하지 않았다).
    const verifyClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    try {
      expect(await listPending(verifyClient, migrationsDir)).toEqual([names[names.length - 1]!]);
    } finally {
      await verifyClient.$disconnect();
    }
  });

  it('죽은 PID 가 적힌 낡은 잠금은 업그레이드를 막지 않는다', async () => {
    const migrationsDir = path.resolve(__dirname, '..', 'prisma', 'migrations');
    const names = listMigrationFiles(migrationsDir);

    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-stale-db-'));
    const dbPath = path.join(dbDir, 'app.db').replace(/\\/g, '/');

    const setupClient = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await setupClient.$connect();
    await applyMigrations(setupClient, migrationsDir, names.slice(0, names.length - 1));
    await setupClient.$disconnect();

    originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${dbPath}`;

    // 어떤 OS 에서도 배정되지 않는 큰 값 → 강제 종료 후 남은 낡은 잠금과 같은 상태.
    writeServerLock(2 ** 30);

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migrate-main-stale-cwd-'));
    process.chdir(workDir);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runMigrate()).toBe(0);
  });
});
