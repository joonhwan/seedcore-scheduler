import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit';
import { DailyLoggerService } from './daily-logger.service';

@Global()
@Module({
  providers: [RateLimitService, DailyLoggerService],
  exports: [RateLimitService, DailyLoggerService],
})
export class CommonModule {}

