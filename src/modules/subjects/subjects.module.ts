import { Module } from '@nestjs/common';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';

@Module({
  imports: [AuditModule, PublicationModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
