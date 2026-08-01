import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';
import { bindPrismaQueryEngine, resolveDatabaseUrl } from '../src/common/db-path';

/**
 * 서버(sp-server.exe)와 **똑같은 규칙**으로 DB 를 찾는다.
 *
 * 예전에는 이 파일이 자체 규칙(process.env.DATABASE_URL → cwd/data/sam.db)을 갖고 있어서
 * `.env` 의 DATABASE_URL 을 아예 보지 않았다. 서버는 db-path.ts 의 resolveDatabaseUrl() 로
 * `.env` 까지 읽으므로, `.env` 가 있는 환경(개발 환경이 대표적)에서는 리셋 도구와 서버가 서로
 * 다른 파일을 열었다 — 도구는 "✅ 성공" 을 출력하는데 서버는 그 변경을 영원히 못 보는,
 * 가장 알아채기 어려운 종류의 조용한 실패였다. 규칙은 한 군데(db-path.ts)에만 두어야 한다.
 */
function setupEnvironment(): string {
  const url = resolveDatabaseUrl();
  process.env.DATABASE_URL = url;

  // pkg 로 만든 exe 안에는 Prisma 쿼리 엔진(.node)이 들어가지 못한다. exe 와 같은 폴더에 놓인
  // query_engine-windows.dll.node 를 찾아 연결해 주지 않으면 첫 쿼리에서
  //   Unable to require(`C:\snapshot\reset-admin\query_engine-windows.dll.node`)
  // 로 실패한다. 이 한 줄이 없어서 sp-reset-admin.exe 는 어떤 인자를 줘도 비밀번호를 바꾸지
  // 못했다 (README.txt 5절 [B] 의 안내 그대로 실행해도 실패). sp-server.exe 와
  // sp-migrate.exe 는 각자의 진입점에서 이미 이 함수를 부른다.
  bindPrismaQueryEngine();

  return url;
}

async function main(): Promise<void> {
  const dbUrl = setupEnvironment();
  const rawPath = dbUrl.startsWith('file:') ? dbUrl.slice('file:'.length) : dbUrl;

  console.log(`🗄  대상 DB: ${dbUrl}`);

  // 존재 확인은 절대 경로일 때만 한다. Prisma 는 상대 `file:` 경로를 schema.prisma 위치 기준으로
  // 푸는데, 여기서 process.cwd() 기준으로 확인하면 실제로 열리는 파일과 다른 곳을 들여다보게 되어
  // 멀쩡한 DB 를 "없다" 고 잘라버린다. (db-path.ts resolveDatabaseUrl() 의 주석과 같은 이유)
  if (path.isAbsolute(rawPath) && !fs.existsSync(rawPath)) {
    console.error(`❌ DB 파일이 존재하지 않습니다: ${rawPath}`);
    console.error(`   sp-server.exe를 먼저 실행하여 데이터베이스를 초기화해 주세요.`);
    process.exit(1);
  }

  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const args = process.argv.slice(2);
  const password = args[0] || 'ChangeMe!Now';

  console.log(`🔐 관리자 계정 ('${username}') 비밀번호 재설정 중...`);

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      console.error(`❌ 오류: '${username}' 계정이 데이터베이스에 존재하지 않습니다.`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);


    await prisma.user.update({
      where: { username },
      data: {
        passwordHash: hash,
        passwordMustChange: false,
        failedLoginCount: 0,
        lockedUntil: null,
        isActive: true,
      },
    });

    console.log(`====================================================`);
    console.log(`✅ 성공: '${username}' 계정 비밀번호가 지정한 암호로 성공적으로 변경되었습니다.`);
    console.log(`👉 신규 비밀번호: ${password}`);
    console.log(`👉 비밀번호 강제 변경이 해제되어 즉시 로그인 가능합니다.`);
    console.log(`====================================================`);
  } catch (err) {
    console.error('❌ 비밀번호 재설정 실패:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// main() 을 맨몸으로 부르면 setupEnvironment() 처럼 try 블록 밖에서 터진 예외가 처리되지 않은
// Promise 거부로 새어나가 영문 스택 트레이스만 남는다.
main().catch((err) => {
  console.error('❌ 비밀번호 재설정 실패:', err);
  process.exit(1);
});
