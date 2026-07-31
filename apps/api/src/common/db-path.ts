import * as fs from 'fs';
import * as path from 'path';

/**
 * DB 연결 문자열을 결정한다. 원래 main.ts 의 setupEnvironment() 안에 있던 로직을 옮긴 것으로,
 * sp-server.exe 와 sp-migrate.exe 가 반드시 같은 파일을 열게 하려고 공용으로 뺐다.
 * 두 exe 가 서로 다른 파일을 열면 조용히 어긋난다.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'sam.db');
  // Prisma SQLite connection string format
  return `file:${dbPath.replace(/\\/g, '/')}`;
}

/** DATABASE_URL 에서 실제 파일 경로만 뽑는다. */
export function resolveDbFilePath(): string {
  const url = resolveDatabaseUrl();
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

/**
 * Prisma Query Engine 바이너리 경로 바인딩 (exe 동일 디렉터리 탐색).
 * 원래 main.ts 에 있던 로직을 그대로 옮겼다.
 */
export function bindPrismaQueryEngine(): void {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    return;
  }
  const candidateFiles = [
    path.join(process.cwd(), 'query_engine-windows.dll.node'),
    path.join(path.dirname(process.execPath), 'query_engine-windows.dll.node'),
    path.join(__dirname, 'query_engine-windows.dll.node'),
    path.join(__dirname, 'client', 'query_engine-windows.dll.node'),
  ];
  for (const f of candidateFiles) {
    if (fs.existsSync(f)) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = f;
      break;
    }
  }
}
