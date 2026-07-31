import * as fs from 'fs';
import * as path from 'path';

/**
 * Nest 없이 돌아가는 CLI 실행 파일(sp-migrate.exe)이 쓰는 최소 로그 기록기.
 *
 * `DailyLoggerService`(apps/api/src/common/daily-logger.service.ts)와 **같은 폴더, 같은 파일명,
 * 같은 한 줄 형식**을 쓴다. 그래야 관리자가 사고를 조사할 때 서버 로그와 업그레이드 로그를
 * 한 파일에서 시간순으로 읽을 수 있다. 다만 그쪽은 Nest 프로바이더(ConsoleLogger 상속)라
 * NestFactory 없이 돌아가는 sp-migrate.exe 에서 그대로 쓸 수 없어, 파일 기록 부분만 따로 뒀다.
 *
 * 오래된 로그 정리(보존 14일)는 하지 않는다. sp-migrate.exe 는 업그레이드할 때만 잠깐
 * 실행되므로, 정리 책임은 상시 실행되는 sp-server.exe 쪽(DailyLoggerService.cleanOldLogs)에
 * 남겨 두는 편이 단순하고 안전하다.
 *
 * 기록 실패는 삼킨다. 로그를 남기지 못하는 것이 업그레이드 자체를 중단시킬 이유는 없다.
 */
export function appendPlainLog(level: string, message: string, context?: string): void {
  try {
    const dir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const now = new Date();
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timestamp =
      `${dateStr} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
      `.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const ctxStr = context ? `[${context}] ` : '';
    // ANSI 색상 이스케이프 코드 제거 (DailyLoggerService 와 같은 처리)
    const clean = message.replace(/\x1B\[\d+m/g, '');
    fs.appendFileSync(
      path.join(dir, `sp-${dateStr}.log`),
      `[${timestamp}] [${level.toUpperCase()}] ${ctxStr}${clean}\n`,
      'utf8',
    );
  } catch {
    // 파일 기록 중 오류 무시
  }
}
