import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { ObservabilityService } from '../../common/logging/observability.service';

export const REPORT_EXPORT_QUEUE = 'report-export';
@Injectable()
export class ReportExportQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly diagnostics: ObservabilityService,
  ) {
    this.queue = new Queue(REPORT_EXPORT_QUEUE, {
      connection: { url: config.get('redisUrl', { infer: true }) },
    });
  }
  async enqueue(jobId: string) {
    const correlationId = this.diagnostics.correlationId();
    await this.queue.add(
      'generate',
      { jobId, correlationId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
    this.diagnostics.emit({
      event: 'queue_job_enqueued',
      operation: 'report_export_generate',
      outcome: 'success',
      reasonCode: 'QUEUE_ACCEPTED',
      references: { job: this.diagnostics.reference('report_export', jobId) },
    });
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
}
