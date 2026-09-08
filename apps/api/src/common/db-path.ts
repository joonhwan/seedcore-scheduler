import * as fs from 'fs';
import * as path from 'path';

/**
 * `.env` 파일 내용에서 `key` 에 해당하는 값 한 줄을 뽑아낸다.
 * dotenv 를 새로 의존성에 넣지 않기 위해 필요한 문법만 직접 파싱하는 최소 파서다.
 * 지원 문법: `KEY=value`, `KEY="value"`, `KEY='value'` (따옴표 제거),
 * 줄 앞뒤/`=` 주변 공백 제거, `#` 주석 줄 무시, `export KEY=value` 접두어 허용.
 * 같은 키가 여러 번 나오면 dotenv 와 동일하게 처음 값을 쓴다. 값이 없거나 빈 문자열이면
 * `undefined` 를 돌려줘서 호출부가 다음 폴백 단계로 넘어가게 한다.
 */
export function parseDotEnvValue(contents: string, key: string): string | undefined {
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const lineKey = line.slice(0, eqIndex).trim();
    if (lineKey !== key) {
      continue;
    }
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (value.length === 0) {
      return undefined;
    }
    return value;
  }
  return undefined;
}

/**
 * `<process.cwd()>/.env` 파일에서 `DATABASE_URL` 값을 읽는다. 상위 디렉터리는 거슬러 올라가지
 * 않는다 — 탐색 범위를 넓히면 exe 가 엉뚱한 `.env` 를 주워 배포 동작이 흔들릴 위험이 있다.
 * 파일이 없거나 읽을 수 없으면 조용히 `undefined` 를 돌려준다 (예외를 던지지 않는다).
 */
function readDotEnvDatabaseUrl(): string | undefined {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const contents = fs.readFileSync(envPath, 'utf-8');
    return parseDotEnvValue(contents, 'DATABASE_URL');
  } catch {
    return undefined;
  }
}

/**
 * DB 연결 문자열을 결정한다. 원래 main.ts 의 setupEnvironment() 안에 있던 로직을 옮긴 것으로,
 * sp-server.exe 와 sp-migrate.exe 가 반드시 같은 파일을 열게 하려고 공용으로 뺐다.
 * 두 exe 가 서로 다른 파일을 열면 조용히 어긋난다.
 *
 * 순서: 1) process.env.DATABASE_URL  2) `.env` 파일의 DATABASE_URL  3) 폴백(cwd/data/sam.db).
 *
 * **2번이 필요한 이유는 exe 배포다.** 이 프로젝트에는 `dotenv` 의존성이 없어 `.env` 를 읽는
 * 코드가 아래 readDotEnvDatabaseUrl() 하나뿐이고, 그것은 이 키만 꺼낸다. 즉 exe 옆에 `.env` 를
 * 두고 DB 경로를 지정하는 길은 이 분기가 유일하다. 이 분기를 "불필요한 우회로"로 보고 지우면
 * 안 된다.
 *
 * 개발 환경에서 `.env` 의 다른 값들(WEB_ORIGIN 등)까지 반영되는 것은 이 함수와 무관하며,
 * `@prisma/client` 를 불러올 때 그쪽이 `.env` 를 통째로 process.env 에 싣는 부수 효과다
 * (Prisma 5.22 에서 실측: require 전 undefined → require 후 파일의 값). 그래서 개발 환경에서는
 * 1번에서 이미 걸리고 2번까지 내려오지 않는다.
 *
 * **exe 에서는 그 부수 효과가 일어나지 않는다.** ncc 번들에 그 로딩 경로가 남지 않기 때문이다
 * (실측: dist-exe 옆에 WEB_ORIGIN 을 적은 `.env` 를 두고 띄우면 부팅 로그에 `WEB_ORIGIN=(없음)`
 * 으로 나온다). 그러므로 exe 에서 `.env` 로 지정할 수 있는 것은 DATABASE_URL 뿐이며, 나머지
 * 환경변수는 OS 환경변수로 넘겨야 한다.
 *
 * 이 주석은 원래 "Prisma CLI 는 `.env` 를 읽지만 Prisma Client 는 읽지 않는다" 고 적혀 있었다.
 * 결론(2번 분기가 필요하다)은 그대로 유효하지만 근거가 사실과 달라 바로잡았다.
 * `.env` 값은 읽은 그대로 돌려준다: Prisma 는 상대 `file:` 경로를 schema.prisma 위치 기준으로
 * 해석하므로, 여기서 process.cwd() 기준으로 절대화하면 CLI 와 다른 파일을 가리키게 된다.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const dotEnvValue = readDotEnvDatabaseUrl();
  if (dotEnvValue) {
    return dotEnvValue;
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
