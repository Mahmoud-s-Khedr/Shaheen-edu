import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

export const REPORT_EXPORT_QUEUE = 'report-export';
@Injectable()
export class ReportExportQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor(config: ConfigService<AppConfig, true>) { this.queue = new Queue(REPORT_EXPORT_QUEUE, { connection: { url: config.get('redisUrl', { infer: true }) } }); }
  async enqueue(jobId: string) { await this.queue.add('generate', { jobId }, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 }); }
  async onModuleDestroy() { await this.queue.close(); }
}
