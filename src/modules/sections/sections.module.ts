import { Module } from '@nestjs/common';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';

@Module({
  imports: [AuditModule, PublicationModule],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService],
})
export class SectionsModule {}
