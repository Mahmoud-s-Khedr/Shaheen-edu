import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { CommerceController, ManualPaymentAdminController } from './commerce.controller';
import { CommerceService } from './commerce.service';

@Module({ imports: [AssetsModule, AuditModule], controllers: [CommerceController, ManualPaymentAdminController], providers: [CommerceService] })
export class CommerceModule {}
