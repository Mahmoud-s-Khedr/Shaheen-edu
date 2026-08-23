import { Module } from '@nestjs/common';
import { PartnerAnalyticsController } from './partner-analytics.controller';
import { PartnerAnalyticsService } from './partner-analytics.service';
import { LedgerPublisherEarningsService } from './ledger-publisher-earnings.service';

@Module({
  controllers: [PartnerAnalyticsController],
  providers: [PartnerAnalyticsService, LedgerPublisherEarningsService],
})
export class PartnerAnalyticsModule {}
