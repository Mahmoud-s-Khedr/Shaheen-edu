import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { ContentAccessPolicyService } from './content-access-policy.service';
import { StudentContentController } from './student-content.controller';
import { PublicContentController } from './public-content.controller';
import { AssetsModule } from '../assets/assets.module';
import { VideosModule } from '../videos/videos.module';
import {
  ContentAssetAccessController,
  StudentContentAssetAccessController,
} from './content-asset-access.controller';

@Module({
  imports: [AuditModule, AssetsModule, VideosModule],
  controllers: [
    EntitlementsController,
    StudentContentController,
    PublicContentController,
    ContentAssetAccessController,
    StudentContentAssetAccessController,
  ],
  providers: [EntitlementsService, ContentAccessPolicyService],
  exports: [EntitlementsService, ContentAccessPolicyService],
})
export class EntitlementsModule {}
