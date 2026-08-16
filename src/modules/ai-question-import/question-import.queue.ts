import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

export const QUESTION_IMPORT_QUEUE = 'ai-question-import';
/** Leaves enough retries for a stalled worker lease to expire and be reclaimed. */
export const QUESTION_IMPORT_MAX_ATTEMPTS = 10;
@Injectable()
export class QuestionImportQueue implements OnModuleDestroy {
  readonly queue: Queue;
  constructor(config: ConfigService<AppConfig, true>) { this.queue = new Queue(QUESTION_IMPORT_QUEUE, { connection: { url: config.get('redisUrl', { infer: true }) } as any }); }
  async enqueue(batchId: string) { await this.queue.add('process', { batchId }, { attempts: QUESTION_IMPORT_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 1000 }); }
  async onModuleDestroy() { await this.queue.close(); }
}
