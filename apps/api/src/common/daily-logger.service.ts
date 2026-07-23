import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const RETENTION_DAYS = 14;

@Injectable()
export class DailyLoggerService extends ConsoleLogger implements LoggerService {
  private get logsDir(): string {
    const dir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private cleanOldLogs(): void {
    try {
      const dir = this.logsDir;
      const files = fs.readdirSync(dir);
      const now = Date.now();
      const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if ((!file.startsWith('sp-') && !file.startsWith('seedcore-')) || !file.endsWith('.log')) continue;
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // 파일 정리 중 오류 무시
    }
  }

  private writeToFile(level: string, message: any, context?: string): void {
    try {
      this.cleanOldLogs();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const logFile = path.join(this.logsDir, `sp-${dateStr}.log`);


      const timestamp = `${dateStr} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      const ctxStr = context ? `[${context}] ` : '';
      const rawMessage = typeof message === 'object' ? JSON.stringify(message) : String(message);

      // ANSI 색상 이스케이프 코드 제거
      const cleanMessage = rawMessage.replace(/\x1B\[\d+m/g, '');
      const formatted = `[${timestamp}] [${level.toUpperCase()}] ${ctxStr}${cleanMessage}\n`;

      fs.appendFileSync(logFile, formatted, 'utf8');
    } catch {
      // 파일 기록 중 오류 무시
    }
  }

  override log(message: any, ...optionalParams: any[]): void {
    super.log(message, ...optionalParams);
    const context = optionalParams[optionalParams.length - 1];
    const ctx = typeof context === 'string' ? context : undefined;
    this.writeToFile('LOG', message, ctx);
  }

  override error(message: any, ...optionalParams: any[]): void {
    super.error(message, ...optionalParams);
    const context = optionalParams[optionalParams.length - 1];
    const ctx = typeof context === 'string' ? context : undefined;
    this.writeToFile('ERROR', message, ctx);
  }

  override warn(message: any, ...optionalParams: any[]): void {
    super.warn(message, ...optionalParams);
    const context = optionalParams[optionalParams.length - 1];
    const ctx = typeof context === 'string' ? context : undefined;
    this.writeToFile('WARN', message, ctx);
  }

  override debug(message: any, ...optionalParams: any[]): void {
    super.debug(message, ...optionalParams);
    const context = optionalParams[optionalParams.length - 1];
    const ctx = typeof context === 'string' ? context : undefined;
    this.writeToFile('DEBUG', message, ctx);
  }

  override verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(message, ...optionalParams);
    const context = optionalParams[optionalParams.length - 1];
    const ctx = typeof context === 'string' ? context : undefined;
    this.writeToFile('VERBOSE', message, ctx);
  }
}
