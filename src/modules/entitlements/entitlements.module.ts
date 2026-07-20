import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { ContentAccessPolicyService } from './content-access-policy.service';
import { StudentContentController } from './student-content.controller';
import { PublicContentController } from './public-content.controller';

@Module({ imports: [AuditModule], controllers: [EntitlementsController, StudentContentController, PublicContentController], providers: [EntitlementsService, ContentAccessPolicyService], exports: [EntitlementsService, ContentAccessPolicyService] })
export class EntitlementsModule {}
