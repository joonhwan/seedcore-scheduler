import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AppModule } from './app.module';
import { DailyLoggerService } from './common/daily-logger.service';


function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'sam.db');
    // Prisma SQLite connection string format
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
  }

  // Prisma Engine 바이너리 경로 바인딩 (exe 동일 디렉터리 탐색)
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
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
}


function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const interfaceName of Object.keys(interfaces)) {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) continue;
    for (const net of networkInterface) {
      // IPv4 및 non-internal(외부 접속 가능한 IP) 추출
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

async function bootstrap() {

  setupEnvironment();

  const dailyLogger = new DailyLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger: dailyLogger,
  });
  app.useLogger(dailyLogger);
  app.setGlobalPrefix('api/v1');

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? true,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  // 0.0.0.0으로 바인딩하여 사내 LAN 타 PC의 IP:Port 접속 허용
  await app.listen(port, '0.0.0.0');

  const ips = getLocalIpAddresses();
  // eslint-disable-next-line no-console
  console.log('====================================================');
  // eslint-disable-next-line no-console
  console.log('  🚀 seedcore-scheduler (SAM Scheduler) 서버 구동 완료!');
  // eslint-disable-next-line no-console
  console.log(`  - 로컬 접속 주소: http://localhost:${port}`);
  if (ips.length > 0) {
    // eslint-disable-next-line no-console
    console.log('  - 사내 LAN 타 PC 접속 주소:');
    for (const ip of ips) {
      // eslint-disable-next-line no-console
      console.log(`    👉 http://${ip}:${port}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  - DB 파일 경로: ${process.env.DATABASE_URL}`);
  // eslint-disable-next-line no-console
  console.log('====================================================');
}

void bootstrap();

