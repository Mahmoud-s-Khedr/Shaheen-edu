import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { ReportsController } from './reports.controller';
import { ReportExportQueue } from './report-export.queue';
import { ReportExportWorker } from './report-export.worker';
import { ReportsService } from './reports.service';
@Module({
  imports: [AssetsModule, AuditModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportQueue, ReportExportWorker],
  exports: [ReportExportWorker],
})
export class ReportsModule {}
