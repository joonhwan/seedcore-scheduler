import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  controllers: [NodesController, CommentsController, HistoryController],
  providers: [NodesService, CommentsService, HistoryService],
  exports: [NodesService],
})
export class NodesModule {}
