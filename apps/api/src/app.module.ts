import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import * as fs from 'fs';
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
import { AutocompleteModule } from './autocomplete/autocomplete.module';
import { AuthGuard } from './auth/auth.guard';

function resolveStaticRoot(): string {
  if (process.env.SERVE_STATIC_ROOT && fs.existsSync(process.env.SERVE_STATIC_ROOT)) {
    return process.env.SERVE_STATIC_ROOT;
  }
  const candidates = [
    path.join(__dirname, 'public'),
    path.join(__dirname, '..', 'public'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'web-dist'),
    path.join(__dirname, '..', '..', 'web', 'dist'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, 'public');
}


@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: resolveStaticRoot(),
      exclude: ['/api/(.*)'],
    }),
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
    AutocompleteModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}

