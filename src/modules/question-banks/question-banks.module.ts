import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';
import { QuestionBanksController, QuestionsController } from './question-banks.controller';
import { QuestionBanksService } from './question-banks.service';

@Module({ imports: [AuditModule, PublicationModule], controllers: [QuestionBanksController, QuestionsController], providers: [QuestionBanksService] })
export class QuestionBanksModule {}
