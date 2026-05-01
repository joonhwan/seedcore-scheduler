import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { OriginGuard } from '../common/origin.guard';
import { AdminOnly } from '../auth/auth.guard';
import { BackupService, type BackupResult } from './backup.service';

@Controller('admin/health/backup')
@UseGuards(OriginGuard)
@AdminOnly()
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post('run')
  @HttpCode(200)
  run(): Promise<BackupResult> {
    return this.backup.runBackup();
  }
}
