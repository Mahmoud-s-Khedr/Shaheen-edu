import { Injectable } from '@nestjs/common';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../../config/configuration';
import {
  QuestionImportChunkStatus,
  QuestionImportItemStatus,
  QuestionImportStatus,
  Role,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import { QuestionBanksService } from '../question-banks/question-banks.service';
import { DocumentTextExtractor } from './document-text-extractor.service';
import {
  OpenRouterQuestionImportClient,
  OpenRouterQuestionImportError,
  type ImportedCandidate,
  type SegmentationResult,
} from './openrouter-question-import.client';
import { QUESTION_IMPORT_MAX_ATTEMPTS, QUESTION_IMPORT_QUEUE } from './question-import.queue';

class IncompleteImportError extends Error {
  constructor(readonly incompleteChunks: number) {
    super(`Waiting to recover ${incompleteChunks} unfinished import chunk(s)`);
  }
}

@Injectable()
export class QuestionImportWorker {
  private worker?: Worker;
  private readonly config: AppConfig['ai'];
  private readonly redisUrl: string;
  private readonly processingLeaseMs: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BunnyStorageProvider,
    private readonly extractor: DocumentTextExtractor,
    private readonly client: OpenRouterQuestionImportClient,
    private readonly questions: QuestionBanksService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.config = config.get('ai', { infer: true });
    this.redisUrl = config.get('redisUrl', { infer: true });
    // A chunk can make one request that lasts up to requestTimeoutMs.  The
    // extra time covers response persistence before another worker may reclaim it.
    this.processingLeaseMs = this.config.requestTimeoutMs + 30_000;
  }
  start() {
    if (!this.config.openRouterApiKey || !this.config.questionImportModel)
      throw new Error('AI question import worker requires OPENROUTER_API_KEY and AI_QUESTION_IMPORT_MODEL');
    if (!this.worker)
      this.worker = new Worker(
        QUESTION_IMPORT_QUEUE,
        async (job) => this.process(job.data.batchId, job.attemptsMade),
        {
          connection: { url: this.redisUrl } as any,
          concurrency: this.config.workerConcurrency,
          lockDuration: this.processingLeaseMs,
        },
      );
  }
  async stop() {
    await this.worker?.close();
  }
  private async process(batchId: string, attemptsMade = 0) {
    const batch: any = await this.prisma.questionImportBatch.findUnique({
      where: { id: batchId },
      include: { sourceAsset: true },
    });
    if (!batch || batch.schemaVersion !== 'question-import-v2') return;
    try {
      if (!batch.normalizedText) {
        await this.prisma.questionImportBatch.update({
          where: { id: batchId },
          data: {
            status: QuestionImportStatus.EXTRACTING,
            startedAt: new Date(),
          },
        });
        const x =
          batch.inputType === 'RAW_TEXT'
            ? { text: batch.rawText, metadata: { format: 'RAW_TEXT' } }
            : await this.extractor.extract({
                mimeType: batch.sourceAsset.mimeType,
                filename: batch.sourceAsset.filename,
                buffer: await this.storage.download(
                  batch.sourceAsset.storageKey,
                ),
              });
        await this.prisma.questionImportBatch.update({
          where: { id: batchId },
          data: {
            normalizedText: x.text,
            extractionMetadata: x.metadata as any,
          },
        });
      }
      const current: any = await this.prisma.questionImportBatch.findUnique({
        where: { id: batchId },
        include: { sourceBlocks: { orderBy: { sequence: 'asc' } } },
      });
      if (current.normalizedText.length > this.config.segmentationMaxCharacters)
        return this.awaitReview(
          batchId,
          'Source is too large for one AI boundary-identification request. Split it into separate imports.',
        );
      let blocks = current.sourceBlocks;
      if (!blocks.length) {
        const parts = current.normalizedText
          .split(/\n\s*\n|\n/)
          .map((x: string) => x.trim())
          .filter(Boolean);
        blocks = await Promise.all(
          parts.map((text: string, index: number) =>
            this.prisma.questionImportSourceBlock.create({
              data: {
                batchId,
                sequence: index + 1,
                blockKey: `B${String(index + 1).padStart(5, '0')}`,
                text,
                sourceLocator: { line: index + 1 },
              },
            }),
          ),
        );
      }
      if (!current.segmentationRawOutput) {
        await this.prisma.questionImportBatch.update({
          where: { id: batchId },
          data: { status: QuestionImportStatus.SEGMENTING },
        });
        const response = await this.client.segmentSource(
          blocks.map((b: any) => ({ key: b.blockKey, text: b.text })),
        );
        const issue = this.validateSegmentation(blocks, response.result);
        if (issue) return this.awaitReview(batchId, issue, response);
        await this.persistSegmentationAndChunks(batchId, blocks, response);
      }
      await this.reclaimStaleProcessingChunks(batchId);
      const pending = await this.prisma.questionImportChunk.findMany({
        where: { batchId, status: QuestionImportChunkStatus.PENDING },
        orderBy: { sequence: 'asc' },
      });
      for (const chunk of pending) await this.processChunk(batch, chunk);
      const incompleteChunks = await this.prisma.questionImportChunk.count({
        where: {
          batchId,
          status: {
            in: [
              QuestionImportChunkStatus.PENDING,
              QuestionImportChunkStatus.PROCESSING,
            ],
          },
        },
      });
      if (incompleteChunks) throw new IncompleteImportError(incompleteChunks);
      const created = await this.prisma.questionImportItem.count({
        where: { batchId, status: QuestionImportItemStatus.CREATED },
      });
      const invalid = await this.prisma.questionImportItem.count({
        where: { batchId, status: QuestionImportItemStatus.INVALID },
      });
      const reviewRequired = await this.prisma.questionImportItem.count({ where: { batchId, status: QuestionImportItemStatus.REVIEW_REQUIRED } });
      const failed = await this.prisma.questionImportChunk.count({
        where: { batchId, status: QuestionImportChunkStatus.FAILED },
      });
      await this.prisma.questionImportBatch.update({
        where: { id: batchId },
        data: {
          status:
            failed || invalid || reviewRequired
              ? QuestionImportStatus.COMPLETED_WITH_ERRORS
              : QuestionImportStatus.COMPLETED,
          completedAt: new Date(),
          completedChunks: await this.prisma.questionImportChunk.count({
            where: { batchId, status: QuestionImportChunkStatus.COMPLETED },
          }),
          totalItems: created + invalid + reviewRequired,
          createdQuestions: created,
          invalidItems: invalid + reviewRequired,
          failedItems: failed,
        },
      });
    } catch (error: any) {
      if (error instanceof IncompleteImportError) {
        if (attemptsMade + 1 < QUESTION_IMPORT_MAX_ATTEMPTS) throw error;
        await this.prisma.questionImportBatch.update({
          where: { id: batchId },
          data: {
            status: QuestionImportStatus.FAILED,
            errorSummary: `Import stopped with ${error.incompleteChunks} unfinished chunk(s) after recovery retries were exhausted`,
            completedAt: new Date(),
          },
        });
        throw error;
      }
      await this.prisma.questionImportBatch.update({
        where: { id: batchId },
        data: {
          status: QuestionImportStatus.FAILED,
          errorSummary: error.message.slice(0, 2000),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }
  private async reclaimStaleProcessingChunks(batchId: string) {
    await this.prisma.questionImportChunk.updateMany({
      where: {
        batchId,
        status: QuestionImportChunkStatus.PROCESSING,
        updatedAt: { lt: new Date(Date.now() - this.processingLeaseMs) },
      },
      data: {
        status: QuestionImportChunkStatus.PENDING,
        errorDetail: 'Recovered after the worker lease expired before chunk completion',
      },
    });
  }
  private validateSegmentation(blocks: any[], result: SegmentationResult) {
    const keys = blocks.map((b) => b.blockKey);
    const range = (firstBlock: string, lastBlock: string) => {
      const first = keys.indexOf(firstBlock), last = keys.indexOf(lastBlock);
      return first < 0 || last < first ? null : { first, last };
    };
    const contextIds = new Set<string>();
    for (const context of result.contexts) {
      if (contextIds.has(context.id) || !range(context.firstBlock, context.lastBlock)) return 'AI returned invalid context metadata.';
      contextIds.add(context.id);
    }
    const questionRanges = new Set<string>();
    let previous = -1;
    for (const question of result.questions) {
      const r = range(question.firstBlock, question.lastBlock);
      if (!r || r.first <= previous || !question.sourceNumber || question.contextIds.some((id) => !contextIds.has(id))) return 'AI returned invalid question boundaries or context references.';
      for (let i = r.first; i <= r.last; i += 1) { if (questionRanges.has(keys[i])) return 'AI returned overlapping question boundaries.'; questionRanges.add(keys[i]); }
      previous = r.last;
    }
    if (!result.questions.length) return 'AI did not identify any question candidates.';
    return result.excluded.every((item) => Boolean(range(item.firstBlock, item.lastBlock))) ? null : 'AI returned invalid excluded-source metadata.';
  }
  private async awaitReview(id: string, message: string, response?: any) {
    await this.prisma.questionImportBatch.update({
      where: { id },
      data: {
        status: QuestionImportStatus.AWAITING_REVIEW,
        errorSummary: message,
        ...(response
          ? {
              segmentationRawOutput: response.raw as any,
              segmentationUsage: response.usage as any,
              segmentationWarnings: response.result.warnings as any,
            }
          : {}),
      },
    });
  }
  private extractionChunks(
    batchId: string,
    blocks: any[],
    result: SegmentationResult,
    contextIdMap: Map<string, string>,
  ) {
    const keys = blocks.map((b) => b.blockKey);
    const contexts = new Map(result.contexts.map((context) => {
      const first = keys.indexOf(context.firstBlock), last = keys.indexOf(context.lastBlock);
      return [context.id, { id: contextIdMap.get(context.id)!, title: context.title ?? null, type: context.type, text: blocks.slice(first, last + 1).map((b: any) => b.text).join('\n') }];
    }));
    const complete = result.questions.filter((question) => ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(question.detectedType)).map((question) => {
      const first = keys.indexOf(question.firstBlock), last = keys.indexOf(question.lastBlock);
      return {
        firstBlock: question.firstBlock,
        lastBlock: question.lastBlock,
        text: blocks
          .slice(first, last + 1)
          .map((b: any) => b.text)
          .join('\n'),
        sourceNumber: question.sourceNumber,
        section: question.section,
        page: question.page,
        contextIds: question.contextIds.map((id) => contextIdMap.get(id)!),
        contexts: question.contextIds.map((id) => contexts.get(id)).filter(Boolean),
        locator: question,
      };
    });
    const batches: any[] = [];
    let current: any[] = [],
      size = 0;
    for (const question of complete) {
      if (
        current.length &&
        (current.length === 25 ||
          size + question.text.length > this.config.extractionMaxCharacters)
      ) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(question);
      size += question.text.length;
    }
    if (current.length) batches.push(current);
    return batches.map((questions, index) => ({
      batchId,
      sequence: index + 1,
      text: JSON.stringify(questions),
      sourceLocator: { ranges: questions.map((q: any) => q.locator) },
      checksum: createHash('sha256')
        .update(JSON.stringify(questions))
        .digest('hex'),
    }));
  }
  private async persistSegmentationAndChunks(
    batchId: string,
    blocks: any[],
    response: { result: SegmentationResult; raw: unknown; usage: unknown },
  ) {
    await this.prisma.$transaction(async (tx: any) => {
      const contextIdMap = new Map<string, string>();
      for (const context of response.result.contexts) {
        const keys = blocks.map((b) => b.blockKey); const first = keys.indexOf(context.firstBlock), last = keys.indexOf(context.lastBlock);
        const created = await tx.questionContext.create({ data: { type: context.type, title: context.title, body: blocks.slice(first, last + 1).map((b: any) => b.text).join('\n'), sourceLocator: { firstBlock: context.firstBlock, lastBlock: context.lastBlock } } });
        contextIdMap.set(context.id, created.id);
      }
      const chunks = this.extractionChunks(batchId, blocks, response.result, contextIdMap);
      await tx.questionImportBatch.update({
        where: { id: batchId },
        data: {
          segmentationRawOutput: response.raw as any,
          segmentationUsage: response.usage as any,
          segmentationWarnings: response.result.warnings as any,
          status: QuestionImportStatus.GENERATING,
          totalChunks: chunks.length,
        },
      });
      await tx.questionImportChunk.createMany({ data: chunks });
    });
  }
  private async processChunk(batch: any, chunk: any) {
    const claim = await this.prisma.questionImportChunk.updateMany({
      where: { id: chunk.id, status: QuestionImportChunkStatus.PENDING },
      data: {
        status: QuestionImportChunkStatus.PROCESSING,
        attemptCount: { increment: 1 },
      },
    });
    if (!claim.count) return;
    try {
      const questions = JSON.parse(chunk.text);
      const r = await this.client.extractQuestions(questions);
      if (r.items.length !== questions.length)
        throw new Error(
          'AI did not return exactly one structured item for each identified question',
        );
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: { rawResponse: r.raw as any, usage: r.usage as any },
      });
      const completedSequences = new Set((await this.prisma.questionImportItem.findMany({ where: { chunkId: chunk.id, questionId: { not: null } }, select: { sequence: true } })).map((item) => item.sequence));
      for (let i = 0; i < r.items.length; i += 1)
        if (!completedSequences.has(i + 1))
          await this.createItem(batch, chunk, i + 1, r.items[i], questions[i]);
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: {
          status: QuestionImportChunkStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (e: any) {
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: {
          status: QuestionImportChunkStatus.FAILED,
          rawResponse: e instanceof OpenRouterQuestionImportError ? e.rawResponse as any : undefined,
          usage: e instanceof OpenRouterQuestionImportError ? e.usage as any : undefined,
          errorDetail: e.message.slice(0, 2000),
        },
      });
    }
  }
  private async createItem(
    batch: any,
    chunk: any,
    sequence: number,
    c: ImportedCandidate,
    source: any,
  ) {
    const selected = new Set(c.answer?.selectedOptionIndexes ?? []);
    const options = c.options?.map((option, index) => ({ ...option, isCorrect: selected.has(index) })) ?? [];
    const explanation = c.explanation;
    const valid =
      c.body?.trim() &&
      Object.values(explanation ?? {}).every((value) => typeof value === 'string' && value.trim()) &&
      options.length >= 2 &&
      new Set(options.map((option) => option.body.trim())).size === options.length &&
      options.some((o) => o.isCorrect) &&
      (c.type !== 'SINGLE_CHOICE' ||
        options.filter((o) => o.isCorrect).length === 1) &&
      (c.type !== 'MULTIPLE_CHOICE' ||
        options.filter((o) => o.isCorrect).length >= 2);
    const reviewRequired = c.answer.confidence < 0.9 || c.warnings.some((warning) => /ambiguous|uncertain/i.test(warning));
    const plainExplanation = explanation ? [explanation.keywords, explanation.eliminationStrategy, explanation.whyCorrect, explanation.generalRule, explanation.whatIf, explanation.commonMistakes].join('\n\n') : '';
    try {
      return await this.prisma.$transaction(async (tx) => {
        // This insert claims the unique chunk sequence before a question is created.
        // It is committed only with the question and final CREATED item state.
        const item = await tx.questionImportItem.create({
          data: {
            batchId: batch.id,
            chunkId: chunk.id,
            sequence,
            status: QuestionImportItemStatus.PROCESSING,
            rawOutput: c as any,
            normalizedOutput: { ...c, options } as any,
            confidence: c.answer?.confidence,
            warnings: c.warnings as any,
            sourceLocator: { firstBlock: source.firstBlock, lastBlock: source.lastBlock, page: source.page },
            sourceNumber: source.sourceNumber,
            globalOrder: Number(source.sourceNumber) || sequence,
            section: source.section,
            detectedType: c.type,
            answerOrigin: c.answer?.origin,
          },
        });
        if (!valid)
          return tx.questionImportItem.update({ where: { id: item.id }, data: { status: QuestionImportItemStatus.INVALID, errorDetail: 'Candidate does not satisfy question domain rules' } });
        if (reviewRequired) return tx.questionImportItem.update({ where: { id: item.id }, data: { status: QuestionImportItemStatus.REVIEW_REQUIRED, errorDetail: 'AI answer requires admin review before a draft can be created' } });
        const q = await this.questions.createImportedDraftWithClient(
          { id: batch.createdById, role: Role.ADMIN, sessionId: 'ai-import-worker' },
          { bankId: batch.bankId, sourceId: batch.sourceId, courseId: batch.courseId, placements: batch.placements, body: c.body, explanation: plainExplanation, type: c.type, options, contextIds: source.contextIds, aiExplanation: explanation, answerOrigin: c.answer.origin, confidence: c.answer.confidence, warnings: c.warnings, model: batch.model },
          tx,
        );
        return tx.questionImportItem.update({ where: { id: item.id }, data: { status: QuestionImportItemStatus.CREATED, questionId: q.id } });
      });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      return this.prisma.questionImportItem.create({
        data: {
          batchId: batch.id,
          chunkId: chunk.id,
          sequence,
          status: QuestionImportItemStatus.INVALID,
          rawOutput: c as any,
          normalizedOutput: c as any,
          sourceLocator: {
            firstBlock: source.firstBlock,
            lastBlock: source.lastBlock,
          },
          errorDetail: e.message.slice(0, 2000),
        },
      });
    }
  }
}
