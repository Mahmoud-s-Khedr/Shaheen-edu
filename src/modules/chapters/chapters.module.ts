import { Module } from '@nestjs/common';
import { ChaptersController } from './chapters.controller';
import { ChaptersService } from './chapters.service';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';

@Module({
  imports: [AuditModule, PublicationModule],
  controllers: [ChaptersController],
  providers: [ChaptersService],
  exports: [ChaptersService],
})
export class ChaptersModule {}
