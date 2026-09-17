import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import {
  AdminVideoFeedbackController,
  StudentVideoFeedbackController,
} from './video-feedback.controller';
import { VideoFeedbackService } from './video-feedback.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [StudentVideoFeedbackController, AdminVideoFeedbackController],
  providers: [VideoFeedbackService],
})
export class VideoFeedbackModule {}
