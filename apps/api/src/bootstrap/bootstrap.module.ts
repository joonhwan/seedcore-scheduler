import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InitialAdminBootstrap } from './initial-admin.bootstrap';

@Module({
  imports: [AuthModule],
  providers: [InitialAdminBootstrap],
})
export class BootstrapModule {}
