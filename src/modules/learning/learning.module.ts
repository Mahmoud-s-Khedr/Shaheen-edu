import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AssetsModule } from '../assets/assets.module';
import { VideosModule } from '../videos/videos.module';
import { QuestionBanksModule } from '../question-banks/question-banks.module';
import { LearningController, ParentLearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../common/guards/parent-selected-child.guard';

@Module({ imports: [EntitlementsModule, AssetsModule, VideosModule, QuestionBanksModule], controllers: [LearningController, ParentLearningController], providers: [LearningService, ParentAuthGuard, ParentSelectedChildGuard], exports: [LearningService] })
export class LearningModule {}
