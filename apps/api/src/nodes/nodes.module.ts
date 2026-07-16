import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { ProjectHistoryController } from './project-history.controller';
import { ProjectHistoryService } from './project-history.service';
import { AutocompleteModule } from '../autocomplete/autocomplete.module';

@Module({
  imports: [AutocompleteModule],
  controllers: [
    NodesController,
    CommentsController,
    HistoryController,
    ProjectHistoryController,
  ],
  providers: [NodesService, CommentsService, HistoryService, ProjectHistoryService],
  exports: [NodesService],
})
export class NodesModule {}

