import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as os from 'os';
import { AppModule } from './app.module';
import { DailyLoggerService } from './common/daily-logger.service';
import { bindPrismaQueryEngine, resolveDatabaseUrl } from './common/db-path';
import { removeServerLock, writeServerLock } from './common/server-lock';


function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = resolveDatabaseUrl();
  }
  bindPrismaQueryEngine();
}


/**
 * 실행 중임을 알리는 잠금 파일을 만들고, 종료 시 지우도록 등록한다.
 *
 * 이 잠금을 읽는 쪽은 sp-migrate.exe 하나뿐이다. 서버가 켜진 채로 마이그레이션을 적용하면
 * 그 사이에 커밋된 사용자 편집이 사전 백업에도 남지 않은 채 사라진다 (server-lock.ts 의
 * resolveServerLockPath() 주석에 전모가 있다). sp-server.exe 는 잠금을 **쓰기만** 한다 —
 * 서버 두 개가 같은 포트를 다투는 문제는 별개이므로 여기서 자기 잠금을 검사하지 않는다.
 *
 * SIGINT/SIGTERM 핸들러를 따로 등록하는 것이 이 함수의 핵심이다. Node 는 SIGINT 리스너가
 * 하나도 없으면 인터럽트로 죽을 때 'exit' 핸들러를 실행하지 않는데, README-exe.txt 가 관리자에게
 * 안내하는 종료 방법이 바로 Ctrl+C 다. 'exit' 만 걸어두면 거의 매번 낡은 잠금이 남는다.
 * (process.exit() 으로 끝나는 경로 — 예: 미적용 마이그레이션 감지 후 exit 3 — 는 'exit' 가 받는다.)
 *
 * 최선 노력(best effort)일 뿐이다. 작업 관리자로 강제 종료하거나 윈도우 콘솔 창을 그냥 닫으면
 * 어느 핸들러도 실행되지 않고 잠금이 남는다. 그래서 sp-migrate.exe 쪽은 파일 존재만으로 막지 않고
 * PID 생존을 확인하며, 그마저 PID 재사용으로 어긋날 경우를 위해 "이 파일을 지우라" 는 탈출구를
 * 안내에 함께 싣는다.
 */
function holdServerLock() {
  writeServerLock();

  process.on('exit', () => {
    removeServerLock();
  });

  const onSignal = () => {
    removeServerLock();
    // 기본 동작(즉시 종료)을 우리가 가로챈 것이므로 직접 끝낸다. 관례적인 128+n 대신 0 을 쓰는
    // 이유는 README-exe.txt 의 종료 코드 표가 0 이외의 번호를 모두 "확인해야 하는 상태" 로
    // 규정하고 있어서다 — 관리자가 스스로 종료한 것은 정상 종료다.
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
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

  // Nest 생성보다 먼저 잡는다. 부팅 도중(빈 DB 초기화 등)에도 이 프로세스가 DB 를 쥐고 있으므로
  // 그 구간까지 sp-migrate.exe 를 막아야 한다.
  holdServerLock();

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

