import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';
import { SubjectConstantsService } from './subject-constants.service';
import {
  AdminSubjectConstantsController,
  PublicSubjectConstantsController,
} from './subject-constants.controller';

@Module({
  imports: [AuditModule, PublicationModule],
  controllers: [
    SubjectsController,
    PublicSubjectConstantsController,
    AdminSubjectConstantsController,
  ],
  providers: [SubjectsService, SubjectConstantsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
