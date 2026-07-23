import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';


function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    const dbPath = path.join(process.cwd(), 'data', 'sam.db');
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
  }
}

async function main() {
  setupEnvironment();

  const dbPath = process.env.DATABASE_URL!.replace('file:', '');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ DB 파일이 존재하지 않습니다: ${dbPath}`);
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

main();
