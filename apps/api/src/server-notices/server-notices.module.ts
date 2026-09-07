import { Module } from '@nestjs/common';
import { ServerNoticesController } from './server-notices.controller';
import { AdminServerNoticesController } from './admin-server-notices.controller';
import { ServerNoticesService } from './server-notices.service';
import { ClosePastNoticesBootstrap } from './close-past-notices.bootstrap';

@Module({
  controllers: [ServerNoticesController, AdminServerNoticesController],
  providers: [ServerNoticesService, ClosePastNoticesBootstrap],
  exports: [ServerNoticesService],
})
export class ServerNoticesModule {}
