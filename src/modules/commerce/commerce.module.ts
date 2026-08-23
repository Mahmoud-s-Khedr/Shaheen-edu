import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import {
  CommerceController,
  ManualPaymentAdminController,
  PaymobWebhookController,
} from './commerce.controller';
import { CommerceService } from './commerce.service';
import { PricingService } from './pricing.service';
import { PaymobService } from './paymob.service';
import { FulfilmentService } from './fulfilment.service';
import { CommerceExpiryService } from './commerce-expiry.service';
import { AdminRefundsController, StudentRefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AssetsModule, AuditModule],
  controllers: [
    CommerceController,
    ManualPaymentAdminController,
    PaymobWebhookController,
    StudentRefundsController,
    AdminRefundsController,
  ],
  providers: [
    CommerceService,
    PricingService,
    PaymobService,
    FulfilmentService,
    CommerceExpiryService,
    RefundsService,
  ],
  exports: [PricingService],
})
export class CommerceModule {}
