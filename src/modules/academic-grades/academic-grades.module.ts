import { Module } from '@nestjs/common';
import { AcademicGradesController } from './academic-grades.controller';
import { PublicAcademicGradesController } from './public-academic-grades.controller';
import { AcademicGradesService } from './academic-grades.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AcademicGradesController, PublicAcademicGradesController],
  providers: [AcademicGradesService],
  exports: [AcademicGradesService],
})
export class AcademicGradesModule {}
