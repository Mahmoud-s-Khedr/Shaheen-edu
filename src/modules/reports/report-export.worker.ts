import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { REPORT_EXPORT_QUEUE } from './report-export.queue';
import { ReportsService } from './reports.service';
import { safeErrorRecord } from '../../common/logging/error-record';
@Injectable()
export class ReportExportWorker {
  private readonly logger = new Logger(ReportExportWorker.name);
  private worker?: Worker;
  private cleanupTimer?: NodeJS.Timeout;
  private ready = false;
  constructor(
    private readonly reports: ReportsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}
  async start(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(
      REPORT_EXPORT_QUEUE,
      async (job) => this.reports.generate(job.data.jobId),
      { connection: { url: this.config.get('redisUrl', { infer: true }) } },
    );
    this.worker.on('error', (error) => {
      this.ready = false;
      this.logger.error({
        event: 'queue_connection_lost',
        queue: REPORT_EXPORT_QUEUE,
        jobCategory: 'report_export',
        ...safeErrorRecord(error),
      });
    });
    this.worker.on('completed', (job) =>
      this.logger.log({
        event: 'queue_job_completed',
        queue: REPORT_EXPORT_QUEUE,
        jobCategory: 'report_export',
        attemptsMade: job.attemptsMade,
      }),
    );
    this.worker.on('failed', (job, error) => {
      const exhausted =
        job &&
        job.opts.attempts !== undefined &&
        job.attemptsMade >= job.opts.attempts;
      this.logger.error({
        event: exhausted ? 'queue_retry_exhausted' : 'queue_job_failed',
        queue: REPORT_EXPORT_QUEUE,
        jobCategory: 'report_export',
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        ...safeErrorRecord(error),
      });
    });
    await this.worker.waitUntilReady();
    this.ready = true;
    const cleanup = () =>
      this.reports.expireCompletedExports().catch((error) =>
        this.logger.error({
          event: 'report_export_cleanup_failed',
          jobCategory: 'report_export',
          ...safeErrorRecord(error),
        }),
      );
    cleanup();
    this.cleanupTimer = setInterval(cleanup, 15 * 60 * 1000);
    this.cleanupTimer.unref();
  }
  isHealthy(): boolean {
    return this.ready;
  }
  async stop() {
    this.ready = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
    await this.worker?.close();
    this.worker = undefined;
  }
}
