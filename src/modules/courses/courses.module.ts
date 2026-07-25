import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { AuditModule } from '../audit/audit.module';
import { PublicationModule } from '../publication/publication.module';

@Module({
  imports: [AuditModule, PublicationModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
