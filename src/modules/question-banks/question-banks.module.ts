import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';
import { QuestionBanksController, QuestionsController } from './question-banks.controller';
import { QuestionCommunityStatsService } from './question-community-stats.service';
import { QuestionBanksService } from './question-banks.service';

@Module({ imports: [AuditModule, PublicationModule], controllers: [QuestionBanksController, QuestionsController], providers: [QuestionBanksService, QuestionCommunityStatsService], exports: [QuestionCommunityStatsService] })
export class QuestionBanksModule {}
