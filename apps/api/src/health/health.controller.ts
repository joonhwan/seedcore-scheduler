import { Controller, Get } from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: string; db: boolean; time: string }> {
    let dbOk = false;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      time: new Date().toISOString(),
    };
  }

  @Get('backup')
  async backup(): Promise<{
    dir: string;
    lastBackupAt: string | null;
    sizeBytes: number | null;
  }> {
    const dir = process.env.BACKUP_DIR ?? '/var/sam-scheduler/backup/daily';
    if (!existsSync(dir)) {
      return { dir, lastBackupAt: null, sizeBytes: null };
    }
    const days = readdirSync(dir).filter((d) => /^\d{8}$/.test(d)).sort().reverse();
    for (const day of days) {
      const file = join(dir, day, 'app.db.gz');
      if (existsSync(file)) {
        const st = statSync(file);
        return { dir, lastBackupAt: st.mtime.toISOString(), sizeBytes: st.size };
      }
    }
    return { dir, lastBackupAt: null, sizeBytes: null };
  }
}
