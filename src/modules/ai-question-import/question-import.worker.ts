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
import { PdfPageRangeService } from './pdf-page-range.service';
import { PdfTranscriptionClient } from './pdf-transcription.client';
import {
  OpenRouterQuestionImportClient,
  OpenRouterQuestionImportError,
  type ImportedCandidate,
  type SegmentationResult,
} from './openrouter-question-import.client';
import { QUESTION_IMPORT_MAX_ATTEMPTS, QUESTION_IMPORT_QUEUE, QuestionImportQueue } from './question-import.queue';

class IncompleteImportError extends Error {
  constructor(readonly incompleteChunks: number) {
    super(`Waiting to recover ${incompleteChunks} unfinished import chunk(s)`);
  }
}
class ReviewRequiredImportError extends Error {}

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
    private readonly pdfRanges: PdfPageRangeService,
    private readonly transcriber: PdfTranscriptionClient,
    private readonly client: OpenRouterQuestionImportClient,
    private readonly questions: QuestionBanksService,
    private readonly queue: QuestionImportQueue,
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
      include: { sourceAsset: true, children: { select: { id: true } } },
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
        const x = batch.inputType === 'ASSET' && batch.sourceAsset.mimeType === 'application/pdf'
          ? await this.transcribePdf(batch)
          : batch.inputType === 'RAW_TEXT'
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
      if (this.needsPageSplit(current.normalizedText)) {
        const children = this.pageChildren(current.normalizedText);
        if (children && !batch.parentId) {
          if (batch.children.length) await Promise.all(batch.children.map((child: any) => this.queue.enqueue(child.id)));
          else await this.createChildren(batch, children);
          return;
        }
        await this.awaitReview(
          batchId,
          'Source exceeds the segmentation token threshold and has no safe PDF page boundaries for automatic splitting.',
        );
        if (batch.parentId) await this.refreshParent(batch.parentId);
        return;
      }
      let blocks = current.sourceBlocks;
      if (!blocks.length) {
        let page: number | null = null;
        let pageLine = 0;
        const parts = current.normalizedText.split('\n').map((value: string, line: number) => {
          const text = value.trim();
          const marker = /^\[Page (\d+)]$/.exec(text);
          if (marker) { page = Number(marker[1]); pageLine = 0; }
          else if (text && page !== null) pageLine += 1;
          return { text, sourceLocator: page === null ? { line: line + 1 } : marker ? { page } : { page, line: pageLine } };
        }).filter((part: any) => Boolean(part.text));
        blocks = await Promise.all(
          parts.map((part: any, index: number) =>
            this.prisma.questionImportSourceBlock.create({
              data: {
                batchId,
                sequence: index + 1,
                blockKey: `B${String(index + 1).padStart(5, '0')}`,
                text: part.text,
                sourceLocator: part.sourceLocator,
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
        const scope = current.pageScope as any;
        const response = await this.client.segmentSource(
          blocks.map((b: any) => ({ key: b.blockKey, text: b.text })),
          scope ? { corePageStart: scope.corePageStart, corePageEnd: scope.corePageEnd } : undefined,
        );
        response.result = this.limitToOwnedPages(blocks, response.result, scope);
        const issue = this.validateSegmentation(blocks, response.result);
        if (issue) {
          await this.awaitReview(batchId, issue, response);
          if (batch.parentId) await this.refreshParent(batch.parentId);
          return;
        }
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
      if (batch.parentId) await this.refreshParent(batch.parentId);
    } catch (error: any) {
      if (error instanceof ReviewRequiredImportError) return;
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
        if (batch.parentId) await this.refreshParent(batch.parentId);
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
      if (batch.parentId) await this.refreshParent(batch.parentId);
      throw error;
    }
  }
  private async transcribePdf(batch: any): Promise<{ text: string; metadata: any }> {
    if (!this.config.pdfTranscriptionModel) throw new Error('PDF imports require AI_PDF_TRANSCRIPTION_MODEL');
    const original = await this.storage.download(batch.sourceAsset.storageKey);
    const totalPages = await this.pdfRanges.pageCount(original);
    await this.prisma.questionImportBatch.update({ where: { id: batch.id }, data: { status: QuestionImportStatus.TRANSCRIBING } });
    // Layer 1 is deliberately neutral: every physical page is OCR'd.  Layer 2
    // receives the complete marked source and decides what is a question,
    // context, or excluded material.
    await this.prisma.questionImportPage.createMany({ data: Array.from({ length: totalPages }, (_, index) => ({ batchId: batch.id, pageNumber: index + 1 })), skipDuplicates: true });
    const existing: any[] = await this.prisma.questionImportPage.findMany({ where: { batchId: batch.id }, orderBy: { pageNumber: 'asc' } });
    for (const stored of existing) {
      // A page-specific retry changes only that page back to PENDING. Keep the
      // persisted evidence for every other failed or review-required page.
      if (stored.status !== 'PENDING') continue;
      try {
        const image = await this.pdfRanges.renderPage(original, stored.pageNumber, 350);
        const initial = await this.transcriber.transcribeImage(image);
        const initialCanonicalText = this.canonicalPageText(initial.page.content);
        const suspicious = initial.page.confidence < 0.9 || initial.page.uncertainSpans.length > 0 || initial.page.warnings.length > 0 || !initialCanonicalText;
        const verified = suspicious ? await this.transcriber.verifyImage(image, initial.page) : null;
        const finalPage = verified?.page ?? initial.page;
        const canonicalText = this.canonicalPageText(finalPage.content);
        const warnings = finalPage.warnings;
        const review = finalPage.uncertainSpans.length > 0 || warnings.length > 0 || !canonicalText;
        await this.prisma.questionImportPage.update({ where: { batchId_pageNumber: { batchId: batch.id, pageNumber: stored.pageNumber } }, data: {
          status: review ? 'REVIEW_REQUIRED' : 'AI_TRANSCRIBED', aiText: finalPage.content, canonicalText, confidence: finalPage.confidence,
          uncertainSpans: finalPage.uncertainSpans as any, warnings: warnings as any, rawProviderResponse: (verified?.raw ?? initial.raw) as any, usage: (verified?.usage ?? initial.usage) as any,
          initialAiText: initial.page.content, initialCanonicalText, initialProviderResponse: initial.raw as any, initialUsage: initial.usage as any,
          verificationProviderResponse: verified?.raw as any, verificationUsage: verified?.usage as any, verifiedAt: verified ? new Date() : null,
          errorDetail: review ? 'Visual OCR transcription requires admin review' : null, attemptCount: { increment: 1 },
        } });
      } catch (error: any) {
        await this.prisma.questionImportPage.update({ where: { batchId_pageNumber: { batchId: batch.id, pageNumber: stored.pageNumber } }, data: { status: 'FAILED', errorDetail: error.message.slice(0, 2000), attemptCount: { increment: 1 } } });
        throw error;
      }
    }
    const pages: any[] = await this.prisma.questionImportPage.findMany({ where: { batchId: batch.id }, orderBy: { pageNumber: 'asc' } });
    const unresolved = pages.filter((page) => page.status !== 'AI_TRANSCRIBED');
    if (pages.length !== totalPages || unresolved.length) {
      await this.awaitReview(batch.id, `PDF transcription has ${unresolved.length || totalPages - pages.length} unresolved page(s).`);
      throw new ReviewRequiredImportError('PDF transcription requires review');
    }
    return { text: pages.map((page) => `[Page ${page.pageNumber}]\n${page.canonicalText}`).join('\n\n'), metadata: { format: 'VISUAL_PDF_OCR', pages: pages.map((page) => ({ page: page.pageNumber, confidence: page.confidence, lineCount: page.canonicalText.split('\n').length })) } };
  }
  private canonicalPageText(value: string) { return value.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim(); }
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
  private pageChildren(text: string): Array<{ text: string; scope: Record<string, number> }> | null {
    const matches = [...text.matchAll(/^\[Page (\d+)]\s*$/gm)];
    if (matches.length < 2) return null;
    const pages = matches.map((match, index) => ({
      page: Number(match[1]),
      text: text.slice(match.index!, matches[index + 1]?.index).trim(),
      tokens: 0,
    }));
    if (pages.some((page, index) => !page.text || (index && page.page !== pages[index - 1].page + 1))) return null;
    for (const page of pages) page.tokens = this.estimateTokens(page.text);
    const target = this.config.segmentationChildTargetTokens;
    const coreBudget = Math.floor(target * 0.9);
    const cores: Array<{ first: number; last: number }> = [];
    for (let first = 0; first < pages.length;) {
      let last = first;
      let size = 0;
      while (last < pages.length && size + pages[last].tokens <= coreBudget) {
        size += pages[last].tokens;
        last += 1;
      }
      if (last === first) return null;
      cores.push({ first, last: last - 1 });
      first = last;
    }
    if (cores.length < 2) return null;
    const overlap = Math.max(0, this.config.pdfSplitOverlapPages);
    const children: Array<{ text: string; scope: Record<string, number> }> = [];
    for (const core of cores) {
      let first = Math.max(0, core.first - overlap);
      let last = Math.min(pages.length - 1, core.last + overlap);
      while (pages.slice(first, last + 1).reduce((size, page) => size + page.tokens, 0) > target) {
        if (first < core.first) first += 1;
        else if (last > core.last) last -= 1;
        else return null;
      }
      children.push({
        text: pages.slice(first, last + 1).map((page) => page.text).join('\n\n'),
        scope: {
          includedPageStart: pages[first].page,
          includedPageEnd: pages[last].page,
          corePageStart: pages[core.first].page,
          corePageEnd: pages[core.last].page,
          coreTokenCount: pages.slice(core.first, core.last + 1).reduce((size, page) => size + page.tokens, 0),
          includedTokenCount: pages.slice(first, last + 1).reduce((size, page) => size + page.tokens, 0),
        },
      });
    }
    return children;
  }
  private estimateTokens(text: string) {
    const arabicCharacters = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
    const otherCharacters = text.length - arabicCharacters;
    return Math.ceil(arabicCharacters / 2.5 + otherCharacters / 4);
  }
  private needsPageSplit(text: string) {
    return this.estimateTokens(text) > this.config.segmentationSplitThresholdTokens;
  }
  private async createChildren(batch: any, children: Array<{ text: string; scope: Record<string, number> }>) {
    const created = await this.prisma.$transaction(async (tx: any) => Promise.all(children.map((child, index) => tx.questionImportBatch.create({
      data: {
        inputType: 'RAW_TEXT', rawText: child.text, normalizedText: child.text,
        extractionMetadata: { format: 'PDF_PAGE_CHUNK', pageScope: child.scope },
        parentId: batch.id, childSequence: index + 1, pageScope: child.scope,
        bankId: batch.bankId, sourceId: batch.sourceId, courseId: batch.courseId,
        placements: batch.placements, model: batch.model, schemaVersion: batch.schemaVersion,
        createdById: batch.createdById,
      },
    }))));
    await this.prisma.questionImportBatch.update({ where: { id: batch.id }, data: { status: QuestionImportStatus.GENERATING, totalChunks: created.length, startedAt: batch.startedAt ?? new Date() } });
    await Promise.all(created.map((child: any) => this.queue.enqueue(child.id)));
  }
  private async refreshParent(parentId: string) {
    const children: any[] = await this.prisma.questionImportBatch.findMany({ where: { parentId } });
    if (!children.length || children.some((child) => ![QuestionImportStatus.COMPLETED, QuestionImportStatus.COMPLETED_WITH_ERRORS, QuestionImportStatus.FAILED, QuestionImportStatus.AWAITING_REVIEW].includes(child.status))) return;
    const failed = children.filter((child) => child.status !== QuestionImportStatus.COMPLETED).length;
    await this.prisma.questionImportBatch.update({ where: { id: parentId }, data: {
      status: failed ? QuestionImportStatus.COMPLETED_WITH_ERRORS : QuestionImportStatus.COMPLETED,
      completedAt: new Date(), completedChunks: children.length,
      totalItems: children.reduce((sum, child) => sum + child.totalItems, 0),
      createdQuestions: children.reduce((sum, child) => sum + child.createdQuestions, 0),
      invalidItems: children.reduce((sum, child) => sum + child.invalidItems, 0),
      failedItems: children.reduce((sum, child) => sum + child.failedItems, 0),
      errorSummary: failed ? `${failed} page range(s) require review or retry` : null,
    } });
  }
  private pageForBlock(blocks: any[], blockKey: string) {
    const index = blocks.findIndex((block) => block.blockKey === blockKey);
    for (let i = index; i >= 0; i -= 1) {
      const match = /^\[Page (\d+)]$/.exec(blocks[i].text);
      if (match) return Number(match[1]);
    }
    return null;
  }
  private limitToOwnedPages(blocks: any[], result: SegmentationResult, scope?: { corePageStart: number; corePageEnd: number }) {
    if (!scope) return result;
    const owned = (firstBlock: string) => {
      const page = this.pageForBlock(blocks, firstBlock);
      return page !== null && page >= scope.corePageStart && page <= scope.corePageEnd;
    };
    return { ...result, questions: result.questions.filter((question) => {
      const page = this.pageForBlock(blocks, question.firstBlock);
      if (!owned(question.firstBlock)) return false;
      question.page = page;
      return true;
    }), excluded: result.excluded.filter((item) => owned(item.firstBlock)), skippedRanges: (result.skippedRanges ?? []).filter((item) => owned(item.firstBlock)) };
  }
  private validateSegmentation(blocks: any[], result: SegmentationResult) {
    if (result.warnings.some((warning) => /(?:continues|additional).{0,80}(?:beyond|omitted)|only the extracted/i.test(warning))) {
      return 'AI reported incomplete source coverage; reduce the segmentation range and retry.';
    }
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
    if (!result.excluded.every((item) => Boolean(range(item.firstBlock, item.lastBlock)))) return 'AI returned invalid excluded-source metadata.';
    return (result.skippedRanges ?? []).every((item) => Boolean(range(item.firstBlock, item.lastBlock))) ? null : 'AI returned invalid skipped-source metadata.';
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
    let current: any[] = [];
    for (const question of complete) {
      const candidate = [...current, question];
      const input = this.extractionInput(candidate);
      if (
        current.length &&
        (current.length === this.config.extractionMaxQuestions || this.estimateTokens(JSON.stringify(input)) + 4_000 > this.config.extractionTargetTokens)
      ) {
        batches.push(current);
        current = [];
      }
      current.push(question);
    }
    if (current.length) batches.push(current);
    return batches.map((questions, index) => ({
      batchId,
      sequence: index + 1,
      text: JSON.stringify(this.extractionInput(questions)),
      sourceLocator: { ranges: questions.map((q: any) => q.locator) },
      checksum: createHash('sha256')
        .update(JSON.stringify(questions))
        .digest('hex'),
    }));
  }
  private extractionInput(questions: any[]) {
    const contexts = new Map<string, any>();
    for (const question of questions) for (const context of question.contexts ?? []) contexts.set(context.id, context);
    // Contexts were attached above only long enough to build a chunk; strip them from every question payload.
    return { contexts: [...contexts.values()], questions: questions.map(({ contexts: _contexts, locator: _locator, ...question }) => question) };
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
      if ((response.result.skippedRanges ?? []).length) await tx.questionImportSkippedRange.createMany({ data: (response.result.skippedRanges ?? []).map((range: any, index: number) => ({ batchId, sequence: index + 1, firstBlock: range.firstBlock, lastBlock: range.lastBlock, reason: range.reason, sourceLocator: { firstBlock: range.firstBlock, lastBlock: range.lastBlock, first: blocks.find((block: any) => block.blockKey === range.firstBlock)?.sourceLocator, last: blocks.find((block: any) => block.blockKey === range.lastBlock)?.sourceLocator } })) });
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
      const input = JSON.parse(chunk.text);
      const questions = Array.isArray(input) ? input : input.questions;
      const r = await this.client.extractQuestions(Array.isArray(input) ? { contexts: [], questions } : input);
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
    const confidence = c.answer?.confidence;
    const sourceWarnings = c.warnings ?? [];
    const corruptionWarning = /ambiguous|uncertain|garbl|corrupt|illegible|مشوش|تشوش|غير\s*واضح|محرّف|محرف|مقطوع|غير\s*مقروء/i;
    const reviewRequired = !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || confidence < 0.9 || c.answer?.origin !== 'EXPLICIT' || sourceWarnings.some((warning) => corruptionWarning.test(warning));
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
            globalOrder: ((batch.childSequence ?? 0) * 1_000_000) + (chunk.sequence * 1_000) + sequence,
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
          { bankId: batch.bankId, sourceId: batch.sourceId, courseId: batch.courseId, placements: batch.placements, body: c.body, explanation: plainExplanation, type: c.type, options, contextIds: source.contextIds, aiExplanation: explanation, aiAnswerOrigin: c.answer.origin, confidence: c.answer.confidence, warnings: c.warnings, model: batch.model },
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
