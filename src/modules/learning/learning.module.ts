import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AssetsModule } from '../assets/assets.module';
import { VideosModule } from '../videos/videos.module';
import { LearningController, ParentLearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({ imports: [EntitlementsModule, AssetsModule, VideosModule], controllers: [LearningController, ParentLearningController], providers: [LearningService], exports: [LearningService] })
export class LearningModule {}
