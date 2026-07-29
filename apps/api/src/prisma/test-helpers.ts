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
  const client = new PrismaClient({
    datasources: { db: { url: `file:${dbPath.replace(/\\/g, '/')}` } },
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
