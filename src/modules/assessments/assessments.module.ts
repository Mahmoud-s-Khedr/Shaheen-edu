import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { QuestionBanksModule } from '../question-banks/question-banks.module';
import { AdminAssessmentsController, AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({ imports: [AuditModule, EntitlementsModule, QuestionBanksModule], controllers: [AssessmentsController, AdminAssessmentsController], providers: [AssessmentsService] })
export class AssessmentsModule {}
