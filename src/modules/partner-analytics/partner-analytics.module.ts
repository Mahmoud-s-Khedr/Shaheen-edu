import { Module } from '@nestjs/common';
import { PartnerAnalyticsController } from './partner-analytics.controller';
import { PartnerAnalyticsService } from './partner-analytics.service';

@Module({
  controllers: [PartnerAnalyticsController],
  providers: [PartnerAnalyticsService],
})
export class PartnerAnalyticsModule {}
