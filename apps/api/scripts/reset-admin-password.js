const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  
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
