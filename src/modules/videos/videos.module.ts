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
  controllers: [VideosController, BunnyStreamWebhookController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
