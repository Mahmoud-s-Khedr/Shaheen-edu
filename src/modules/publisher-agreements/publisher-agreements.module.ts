import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PricingController, PublisherAgreementsController } from './publisher-agreements.controller';
import { PublisherAgreementsService } from './publisher-agreements.service';

@Module({ imports: [AuditModule], controllers: [PublisherAgreementsController, PricingController], providers: [PublisherAgreementsService], exports: [PublisherAgreementsService] })
export class PublisherAgreementsModule {}
