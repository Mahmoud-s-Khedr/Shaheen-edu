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

@Module({
  imports: [AssetsModule, AuditModule],
  controllers: [
    CommerceController,
    ManualPaymentAdminController,
    PaymobWebhookController,
  ],
  providers: [
    CommerceService,
    PricingService,
    PaymobService,
    FulfilmentService,
    CommerceExpiryService,
  ],
  exports: [PricingService],
})
export class CommerceModule {}
