import { Global, Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { AdminSessionsController } from './admin-sessions.controller';

@Global()
@Module({
  controllers: [AdminSessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
