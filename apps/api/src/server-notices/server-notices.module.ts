import { Module } from '@nestjs/common';
import { ServerNoticesController } from './server-notices.controller';
import { AdminServerNoticesController } from './admin-server-notices.controller';
import { ServerNoticesService } from './server-notices.service';

@Module({
  controllers: [ServerNoticesController, AdminServerNoticesController],
  providers: [ServerNoticesService],
  exports: [ServerNoticesService],
})
export class ServerNoticesModule {}
