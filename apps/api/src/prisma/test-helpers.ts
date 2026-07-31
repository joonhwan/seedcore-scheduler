import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

export interface TempDb {
  client: PrismaClient;
  dbPath: string;
  cleanup: () => Promise<void>;
}

/**
 * 빈 SQLite 파일을 임시 디렉터리에 만들고 연결한 PrismaClient 를 돌려준다.
 * Windows 파일 잠금 때문에 테스트마다 독립 디렉터리를 쓴다.
 */
export async function createTempDb(): Promise<TempDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-migration-test-'));
  const dbPath = path.join(dir, 'test.db');
  // connection_limit=1: PRAGMA(foreign_keys=OFF, defer_foreign_keys 등)는 커넥션 단위로 적용된다.
  // 풀에 커넥션이 둘 이상이면 마이그레이션 SQL 안의 PRAGMA 문장과 뒤따르는 DROP/INSERT 문장이
  // 서로 다른 커넥션에서 실행될 수 있어, FK 가 켜진 채로 테이블 재정의(RedefineTables)가 일어나고
  // ON DELETE CASCADE 가 조용히 자식 레코드를 지워버릴 수 있다. 단일 커넥션으로 고정해 그 경로를 막는다.
  // (applyMigrations() 를 실제로 호출하는 모든 client 는 이 제약을 반드시 지켜야 한다.)
  const client = new PrismaClient({
    datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}?connection_limit=1` } },
  });
  await client.$connect();

  return {
    client,
    dbPath,
    cleanup: async () => {
      await client.$disconnect();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows 에서 엔진이 핸들을 늦게 놓는 경우가 있다. 임시 디렉터리라 남아도 무해하다.
      }
    },
  };
}
