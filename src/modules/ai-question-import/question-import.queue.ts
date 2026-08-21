import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

export const QUESTION_IMPORT_QUEUE = 'ai-question-import';
export const QUESTION_IMPORT_PAGE_QUEUE = 'ai-question-import-page';
export const QUESTION_IMPORT_CHUNK_QUEUE = 'ai-question-import-chunk';
/** Leaves enough retries for a stalled worker lease to expire and be reclaimed. */
export const QUESTION_IMPORT_MAX_ATTEMPTS = 10;
@Injectable()
export class QuestionImportQueue implements OnModuleDestroy {
  readonly queue: Queue;
  readonly pageQueue: Queue;
  readonly chunkQueue: Queue;
  private readonly connection: any;
  constructor(config: ConfigService<AppConfig, true>) {
    this.connection = { url: config.get('redisUrl', { infer: true }) };
    this.queue = new Queue(QUESTION_IMPORT_QUEUE, {
      connection: this.connection,
    });
    this.pageQueue = new Queue(QUESTION_IMPORT_PAGE_QUEUE, {
      connection: this.connection,
    });
    this.chunkQueue = new Queue(QUESTION_IMPORT_CHUNK_QUEUE, {
      connection: this.connection,
    });
  }
  async enqueue(batchId: string) {
    await this.queue.add(
      'process',
      { batchId },
      {
        attempts: QUESTION_IMPORT_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
  }
  async enqueuePage(batchId: string, pageNumber: number) {
    await this.pageQueue.add(
      'transcribe-page',
      { batchId, pageNumber },
      {
        // A coordinator may observe the page as PENDING while BullMQ has its
        // retry delayed. Reusing this id preserves that job's attempt counter
        // instead of creating a fresh retry budget for the same page.
        jobId: `page-${batchId}-${pageNumber}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        // Page state and diagnostics are retained in Postgres. Removing the
        // terminal queue job lets an explicit admin retry reuse its stable id.
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
  async enqueueChunk(batchId: string, chunkId: string) {
    await this.chunkQueue.add(
      'extract-chunk',
      { batchId, chunkId },
      {
        attempts: QUESTION_IMPORT_CHUNK_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }
  async onModuleDestroy() {
    await Promise.all([
      this.queue.close(),
      this.pageQueue.close(),
      this.chunkQueue.close(),
    ]);
  }
}

export const QUESTION_IMPORT_CHUNK_MAX_ATTEMPTS = 2;
