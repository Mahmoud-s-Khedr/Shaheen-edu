import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { REPORT_EXPORT_QUEUE } from './report-export.queue';
import { ReportsService } from './reports.service';
@Injectable()
export class ReportExportWorker {
  private readonly logger = new Logger(ReportExportWorker.name); private worker?: Worker; private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly reports: ReportsService, private readonly config: ConfigService<AppConfig, true>) {}
  start() { if (this.worker) return; this.worker = new Worker(REPORT_EXPORT_QUEUE, async (job) => this.reports.generate(job.data.jobId), { connection: { url: this.config.get('redisUrl', { infer: true }) } }); this.worker.on('error', (error) => this.logger.error(`Report export worker error: ${error.message}`, error.stack)); const cleanup = () => this.reports.expireCompletedExports().catch((error) => this.logger.error(`Report export expiry cleanup failed: ${error.message}`, error.stack)); cleanup(); this.cleanupTimer = setInterval(cleanup, 15 * 60 * 1000); this.cleanupTimer.unref(); }
  async stop() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); this.cleanupTimer = undefined; await this.worker?.close(); this.worker = undefined; }
}
