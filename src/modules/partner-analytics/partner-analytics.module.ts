import { Module } from '@nestjs/common';
import { PartnerAnalyticsController } from './partner-analytics.controller';
import { PartnerAnalyticsService } from './partner-analytics.service';
import { LedgerPublisherEarningsService } from './ledger-publisher-earnings.service';
import { PublisherUsageRollupsService } from './publisher-usage-rollups.service';

@Module({
  controllers: [PartnerAnalyticsController],
  providers: [
    PartnerAnalyticsService,
    LedgerPublisherEarningsService,
    PublisherUsageRollupsService,
  ],
  exports: [PublisherUsageRollupsService],
})
export class PartnerAnalyticsModule {}
