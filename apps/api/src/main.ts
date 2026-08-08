import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as os from 'os';
import { AppModule } from './app.module';
import { DailyLoggerService } from './common/daily-logger.service';
import { bindPrismaQueryEngine, resolveDatabaseUrl } from './common/db-path';
import { appendPlainLog } from './common/plain-daily-log';
import { removeLock } from './common/process-lock';
import { describeCookieSecure } from './common/cookie-security';
import { acquireLock } from './prisma/lock-decision';


function setupEnvironment() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = resolveDatabaseUrl();
  }
  bindPrismaQueryEngine();
}


/**
 * 화면과 로그 파일에 동시에 남긴다 (migrate-main.ts 의 emitError() 와 같은 이유, 같은 형식).
 *
 * 이 시점에는 Nest 도 DailyLoggerService 도 아직 없어 console 밖에 없는데, README-exe.txt 는
 * 관리자에게 sp-server.exe 를 더블클릭해 실행하라고 안내한다 — 종료와 함께 창이 사라지면 화면에만
 * 있던 안내는 흔적도 남지 않는다. 잠금 충돌 안내는 그 창이 사라진 뒤에도 읽을 수 있어야 한다.
 */
function emitBootError(message: string): void {
  // eslint-disable-next-line no-console
  console.error(message);
  appendPlainLog('ERROR', message, 'sp-server');
}


/**
 * 다른 프로세스가 이 DB 를 쓰고 있지 않은지 확인하고, 실행 중임을 알리는 잠금 파일을 만든다.
 * 시작해도 되면 true, 안내를 출력하고 물러나야 하면 false.
 *
 * **검사가 반드시 쓰기보다 먼저다.** 순서를 뒤집으면 두 번째 서버가 첫 번째의 PID 를 덮어써
 * 충돌을 아무도 눈치채지 못하고, 두 번째가 종료할 때 잠금이 사라져 첫 번째가 살아 있는데도
 * sp-migrate.exe 가 진행해버린다 (process-lock.ts 의 removeLock() 주석 참고).
 * 그 순서와 기록 후 되읽어 검증은 acquireLock() 이 담당한다 (src/prisma/lock-decision.ts).
 *
 * 두 가지를 본다.
 *  - 다른 sp-server.exe: 한 DB 를 두 서버가 고치면 데이터가 어긋난다. 부수 효과로 진단도 좋아진다 —
 *    예전에는 두 번째 서버가 3000번 포트 바인딩에서 EADDRINUSE 로 죽으면서 처리되지 않은 Promise
 *    거부로 영문 스택 트레이스만 남기고 exit 1 로 끝났다. README 의 exit 1 은 "DB 파일을 지워야 할
 *    수도 있는 상태" 와 묶여 있어 최악의 오조작을 유발할 수 있었다. 이제 Nest 를 띄우기 전에
 *    한국어 안내 + exit 7 로 끝난다.
 *  - sp-migrate.exe: 업그레이드 도중 부팅하면 반쯤 재작성된 스키마를 읽거나 곧 DROP 될 테이블에
 *    쓴다. 마이그레이션이 트랜잭션 없이 문장 단위로 커밋되기 때문에 생기는 창이다.
 *
 * SIGINT/SIGTERM 핸들러를 따로 등록하는 것이 이 함수의 또 다른 핵심이다. Node 는 SIGINT 리스너가
 * 하나도 없으면 인터럽트로 죽을 때 'exit' 핸들러를 실행하지 않는데, README-exe.txt 가 관리자에게
 * 안내하는 종료 방법이 바로 Ctrl+C 다. 'exit' 만 걸어두면 거의 매번 낡은 잠금이 남는다.
 * (process.exit() 으로 끝나는 경로 — 예: 미적용 마이그레이션 감지 후 exit 3 — 는 'exit' 가 받는다.)
 *
 * 정리는 최선 노력(best effort)일 뿐이다. 작업 관리자로 강제 종료하거나 윈도우 콘솔 창을 그냥 닫으면
 * 어느 핸들러도 실행되지 않고 잠금이 남는다. 그래서 잠금 확인은 파일 존재가 아니라 PID 생존으로
 * 하고, 그마저 PID 재사용으로 어긋날 경우를 위해 "이 파일을 지우라" 는 탈출구를 안내에 함께 싣는다.
 */
function acquireServerLock(): boolean {
  const acquisition = acquireLock('server');
  if (acquisition.kind === 'halt') {
    emitBootError('');
    emitBootError(acquisition.notice);
    return false;
  }

  // 잠금을 못 걸었어도 서버는 시작한다. 다만 안전장치가 꺼진 상태를 조용히 넘기지 않는다 —
  // 이 줄이 없으면 나중에 사고가 났을 때 "그때 잠금이 없었다" 는 사실을 알아낼 방법이 없다.
  if (acquisition.warning !== undefined) {
    emitBootError(acquisition.warning);
  }

  // 잠금을 쥐지 못한 경우에도 핸들러는 그대로 등록한다. removeLock() 이 소유권을 확인하므로
  // 남의 잠금을 지울 위험이 없고, 분기를 두지 않는 편이 종료 경로가 단순하다.
  process.on('exit', () => {
    removeLock('server');
  });

  const onSignal = () => {
    removeLock('server');
    // 기본 동작(즉시 종료)을 우리가 가로챈 것이므로 직접 끝낸다. 관례적인 128+n 대신 0 을 쓰는
    // 이유는 README-exe.txt 의 종료 코드 표가 0 이외의 번호를 모두 "확인해야 하는 상태" 로
    // 규정하고 있어서다 — 관리자가 스스로 종료한 것은 정상 종료다.
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  return true;
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

  // Nest 생성보다 먼저 확인하고 잡는다. 부팅 도중(빈 DB 초기화 등)에도 이 프로세스가 DB 를 쥐고
  // 있으므로 그 구간까지 sp-migrate.exe 를 막아야 하고, 반대로 다른 프로세스가 쓰고 있다면
  // Prisma 가 DB 파일을 열기 전에 멈춰야 한다.
  if (!acquireServerLock()) {
    // exit 7 = "다른 프로세스가 DB 를 쓰고 있어 시작하지 않았다" (README-exe.txt 종료 코드 표).
    // 예외를 던지지 않는 이유: bootstrap() 은 void 로 호출되므로 여기서 throw 하면 처리되지 않은
    // Promise 거부가 되어 영문 스택 트레이스와 exit 1 로 끝난다 — 안내를 이미 출력한 상태에서
    // 관리자를 다시 혼란에 빠뜨리는 셈이다.
    process.exit(7);
  }

  const dailyLogger = new DailyLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger: dailyLogger,
  });
  app.useLogger(dailyLogger);
  app.setGlobalPrefix('api/v1');

  // 이 서버는 사내망에서 평문 HTTP 로 직접 서비스된다. sp-server.exe 는 물론이고
  // deploy/nginx.conf 도 `listen 80;` 뿐으로 TLS 종단이 없다. 그런데 helmet 의 기본값은
  // HTTPS 를 전제로 하므로, 아래 두 개를 그대로 두면 사내 IP 접속이 깨진다.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // upgrade-insecure-requests 를 지운다 (null 을 주면 기본 지시어에서 빠진다).
          //
          // 이게 켜져 있으면 브라우저가 페이지 안의 모든 하위 요청을 https 로 바꿔 보낸다.
          // http://localhost:3000 은 localhost 가 "신뢰할 수 있는 출처" 로 취급되어 예외지만,
          // http://192.168.x.x:3000 같은 사내 IP 는 예외가 아니다. 그래서 사내 IP 로 접속하면
          //   GET https://192.168.x.x:3000/assets/index-*.js  net::ERR_SSL_PROTOCOL_ERROR
          // 처럼 js/css/favicon 이 전부 실패하고 화면이 빈 채로 뜬다.
          // localhost 에서만 확인하면 절대 재현되지 않는 종류의 문제다.
          'upgrade-insecure-requests': null,
        },
      },
      // HSTS 는 평문 HTTP 응답에서 브라우저가 무시하므로 지금 당장은 무해하다. 그래도 끄는
      // 이유: 앞단에 TLS 를 한 번이라도 붙이면 "이 호스트는 1년간 https 로만 접속" 이 각인되고,
      // 사내 IP 에 그게 박히면 평문으로 되돌릴 방법이 사용자 브라우저마다 수동 초기화뿐이다.
      // TLS 를 정식으로 도입할 때 여기서 다시 켜는 편이 안전하다.
      hsts: false,
    }),
  );
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
  // 로그인이 안 된다는 문의가 왔을 때 가장 먼저 볼 줄이다. Secure=ON 인데 위 접속 주소가
  // http 로 찍혀 있으면 그것이 원인이다 — 브라우저가 세션 쿠키를 조용히 버린다.
  // eslint-disable-next-line no-console
  console.log(`  - ${describeCookieSecure()}`);
  // eslint-disable-next-line no-console
  console.log('====================================================');
}

void bootstrap();

