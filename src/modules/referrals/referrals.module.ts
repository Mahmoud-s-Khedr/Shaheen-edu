import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { ReferralReportingService } from './referral-reporting.service';
import {
  AdminReferralReportingController,
  PartnerReferralReportingController,
} from './referral-reporting.controller';

@Module({
  imports: [AuditModule],
  controllers: [
    ReferralsController,
    PartnerReferralReportingController,
    AdminReferralReportingController,
  ],
  providers: [ReferralsService, ReferralReportingService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
