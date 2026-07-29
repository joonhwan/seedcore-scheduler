const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

/**
 * Prisma Client(런타임)는 .env 를 읽지 않는다. (.env 를 읽는 것은 Prisma CLI 뿐)
 * 따라서 서버(src/main.ts setupEnvironment)와 **동일한 규칙**으로 DATABASE_URL 을 조립한다.
 * 여기서 .env 를 로드하면 마이그레이션 전용 DB(prisma/data/app.db)를 건드리게 되므로 하지 않는다.
 */
function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    const dbPath = path.join(process.cwd(), 'data', 'sam.db');
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
  }
}

setupEnvironment();

const dbFile = process.env.DATABASE_URL.replace(/^file:/, '');
if (!fs.existsSync(dbFile)) {
  console.error(`Error: DB file not found: ${dbFile}`);
  console.error('       Run the API server once (or `pnpm -F @sam/api prisma:migrate:dev`) to initialize it.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';

  console.log(`Target DB: ${dbFile}`);

  // 터미널 실행 인자에서 새 비밀번호 추출 (예: pnpm db:reset-admin MyNewPassword)
  const args = process.argv.slice(2);
  const password = args[0] || process.env.INITIAL_ADMIN_PASSWORD || 'ChangeMe!Now';

  console.log(`Resetting admin password for '${username}'...`);

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    console.error(`Error: User '${username}' does not exist in the database.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);


  await prisma.user.update({
    where: { username },
    data: {
      passwordHash: hash,
      passwordMustChange: false, // 백엔드 강제 리셋이므로 즉시 로그인 및 사용 가능하도록 false 설정
      failedLoginCount: 0,
      lockedUntil: null,
      isActive: true
    }
  });

  console.log(`Success: Password for '${username}' has been reset to '${password}'.`);
  console.log(`Force password change is disabled. You can now log in directly.`);
}

main()
  .catch((err) => {
    console.error('Failed to reset admin password:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
