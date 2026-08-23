import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PartnerAnalyticsModule } from '../partner-analytics/partner-analytics.module';
import { PartnerFinanceController } from './partner-finance.controller';
import { PartnerFinanceService } from './partner-finance.service';
@Module({
  imports: [AuditModule, PartnerAnalyticsModule],
  controllers: [PartnerFinanceController],
  providers: [PartnerFinanceService],
})
export class PartnerFinanceModule {}
