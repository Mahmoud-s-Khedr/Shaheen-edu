import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { QuestionAiExplanationsController } from './question-ai-explanations.controller';
import { QuestionAiExplanationClient } from './question-ai-explanation.client';
import { QuestionAiExplanationsService } from './question-ai-explanations.service';

@Module({
  imports: [AuditModule, AssetsModule],
  controllers: [QuestionAiExplanationsController],
  providers: [QuestionAiExplanationsService, QuestionAiExplanationClient],
})
export class QuestionAiExplanationsModule {}
