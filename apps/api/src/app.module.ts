import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { MembersModule } from './members/members.module';
import { NodesModule } from './nodes/nodes.module';
import { BackupModule } from './backup/backup.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuditModule,
    SessionsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    MembersModule,
    NodesModule,
    BackupModule,
    BootstrapModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
