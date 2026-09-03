import { Module } from '@nestjs/common';
import { UserProjectsController } from './user-projects.controller';
import { UserProjectsService } from './user-projects.service';

@Module({
  controllers: [UserProjectsController],
  providers: [UserProjectsService],
  exports: [UserProjectsService],
})
export class UserProjectsModule {}
