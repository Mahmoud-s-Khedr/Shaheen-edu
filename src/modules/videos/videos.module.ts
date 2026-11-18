import { VideoDeletionRequestsController } from '../video-deletion-requests/video-deletion-requests.controller';
import { VideoDeletionRequestsService } from '../video-deletion-requests/video-deletion-requests.service';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AssetsModule } from '../assets/assets.module';
import {
  VideosController,
  BunnyStreamWebhookController,
} from './videos.controller';
import { VideosService } from './videos.service';
@Module({
  imports: [AuditModule, AssetsModule],
  controllers: [
    VideosController,
    BunnyStreamWebhookController,
    VideoDeletionRequestsController,
  ],
  providers: [VideosService, VideoDeletionRequestsService],
  exports: [VideosService],
})
export class VideosModule {}
