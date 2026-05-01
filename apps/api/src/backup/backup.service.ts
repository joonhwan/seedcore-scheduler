import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface BackupResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  path?: string;
  sizeBytes?: number;
  sha256?: string;
  durationMs?: number;
}

const CRON_JOB_NAME = 'backup-daily';
const TIMEZONE = 'Asia/Seoul';

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private isRunning = false;

  readonly backupDir: string;
  readonly dbPath: string;
  readonly cronExpr: string;
  readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
  ) {
    const cwd = process.cwd();
    this.backupDir = path.resolve(
      process.env.BACKUP_DIR && process.env.BACKUP_DIR.length > 0
        ? process.env.BACKUP_DIR
        : path.join(cwd, 'data', 'backup'),
    );
    this.dbPath = path.resolve(
      process.env.BACKUP_DB_PATH && process.env.BACKUP_DB_PATH.length > 0
        ? process.env.BACKUP_DB_PATH
        : path.join(cwd, 'prisma', 'data', 'app.db'),
    );
    this.cronExpr = process.env.BACKUP_CRON ?? '0 4 * * *';
    const r = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
    this.retentionDays = Number.isFinite(r) && r > 0 ? r : 30;
  }

  onModuleInit(): void {
    try {
      const job = new CronJob(
        this.cronExpr,
        () => {
          this.runBackup().catch((err: unknown) =>
            this.logger.error(`scheduled backup failed: ${stringifyError(err)}`),
          );
        },
        null,
        false,
        TIMEZONE,
      );
      this.scheduler.addCronJob(CRON_JOB_NAME, job);
      job.start();
      this.logger.log(
        `backup cron registered: "${this.cronExpr}" (${TIMEZONE}) → dir=${this.backupDir} db=${this.dbPath} keep=${this.retentionDays}d`,
      );
    } catch (err) {
      this.logger.error(
        `invalid BACKUP_CRON "${this.cronExpr}": ${stringifyError(err)}. cron disabled — manual trigger 가능.`,
      );
    }
  }

  async runBackup(): Promise<BackupResult> {
    if (this.isRunning) {
      this.logger.warn('skip — backup already in progress');
      return { ok: false, skipped: true, reason: 'already_running' };
    }
    this.isRunning = true;
    const started = Date.now();
    try {
      const day = formatDay(new Date());
      const destDir = path.join(this.backupDir, day);

      try {
        await fs.mkdir(destDir, { recursive: true });
      } catch (err) {
        this.logger.error(`mkdir ${destDir} failed: ${stringifyError(err)}`);
        return { ok: false, reason: 'mkdir_failed' };
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sam-backup-'));
      const tmpPath = path.join(tmpDir, 'app.db');

      try {
        // SQLite 의 VACUUM INTO 는 prepared parameter 미지원 → 인라인.
        // path 의 작은따옴표만 escape (SQLite 는 ''  로 escape).
        const escaped = tmpPath.replace(/'/g, "''");
        await this.prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);

        const gzPath = path.join(destDir, 'app.db.gz');
        await pipeline(
          createReadStream(tmpPath),
          createGzip({ level: 9 }),
          createWriteStream(gzPath),
        );

        const sha = await sha256File(gzPath);
        await fs.writeFile(
          path.join(destDir, 'app.db.gz.sha256'),
          `${sha}  app.db.gz\n`,
          'utf8',
        );

        const stat = await fs.stat(gzPath);
        const result: BackupResult = {
          ok: true,
          path: gzPath,
          sizeBytes: stat.size,
          sha256: sha,
          durationMs: Date.now() - started,
        };
        this.logger.log(
          `backup ok: ${gzPath} ${stat.size}B sha=${sha.substring(0, 12)}… (${result.durationMs}ms)`,
        );

        await this.cleanupOld().catch((err: unknown) =>
          this.logger.warn(`cleanup failed: ${stringifyError(err)}`),
        );
        return result;
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      this.logger.error(`backup failed: ${stringifyError(err)}`);
      return { ok: false, reason: 'exception' };
    } finally {
      this.isRunning = false;
    }
  }

  private async cleanupOld(): Promise<void> {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    let entries: string[];
    try {
      entries = await fs.readdir(this.backupDir);
    } catch {
      return;
    }
    let removed = 0;
    for (const name of entries) {
      if (!/^\d{8}$/.test(name)) continue;
      const dir = path.join(this.backupDir, name);
      try {
        const st = await fs.stat(dir);
        if (st.mtimeMs < cutoff) {
          await fs.rm(dir, { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // 무시 — 다음 사이클에서 재시도
      }
    }
    if (removed > 0) {
      this.logger.log(`cleanup: removed ${removed} entries older than ${this.retentionDays}d`);
    }
  }
}

function formatDay(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
