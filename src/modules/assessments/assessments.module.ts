import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { QuestionBanksModule } from '../question-banks/question-banks.module';
import { AssetsModule } from '../assets/assets.module';
import { VideosModule } from '../videos/videos.module';
import {
  AdminAssessmentsController,
  AssessmentsController,
} from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { AssessmentAiClient } from './assessment-ai.client';
import {
  AdminQuestionReportsController,
  QuestionIntelligenceController,
  StudentVoiceController,
} from './question-intelligence.controller';

@Module({
  imports: [
    AuditModule,
    EntitlementsModule,
    QuestionBanksModule,
    AssetsModule,
    VideosModule,
  ],
  controllers: [
    AssessmentsController,
    AdminAssessmentsController,
    QuestionIntelligenceController,
    StudentVoiceController,
    AdminQuestionReportsController,
  ],
  providers: [AssessmentsService, AssessmentAiClient],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
