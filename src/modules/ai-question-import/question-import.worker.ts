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
  QuestionAnswerProvenance,
  QuestionContentBlockType,
  QuestionImportMediaAssignmentOwner,
  QuestionImportMediaAssignmentStatus,
  QuestionImportMediaStatus,
  QuestionImportVisualResolutionState,
  Role,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import { QuestionBanksService } from '../question-banks/question-banks.service';
import { DocumentTextExtractor } from './document-text-extractor.service';
import { PdfPageRangeService } from './pdf-page-range.service';
import { PdfTranscriptionClient } from './pdf-transcription.client';
import { QuestionImportMediaService } from './question-import-media.service';
import { QuestionImportVisualLinkerService } from './question-import-visual-linker.service';
import {
  OpenRouterQuestionImportClient,
  OpenRouterQuestionImportError,
  type ImportedCandidate,
  type ImportedCandidateV3,
  type ImportedCandidateV4,
  type SegmentationResult,
  type SegmentationResultV3,
} from './openrouter-question-import.client';
import {
  QUESTION_IMPORT_MAX_ATTEMPTS,
  QUESTION_IMPORT_QUEUE,
  QuestionImportQueue,
} from './question-import.queue';

/** One automatic retry prevents a transient model response from permanently losing a question. */
const QUESTION_IMPORT_CHUNK_MAX_ATTEMPTS = 2;

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
  private readonly visualLinker = new QuestionImportVisualLinkerService();
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BunnyStorageProvider,
    private readonly extractor: DocumentTextExtractor,
    private readonly pdfRanges: PdfPageRangeService,
    private readonly transcriber: PdfTranscriptionClient,
    private readonly media: QuestionImportMediaService,
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
      throw new Error(
        'AI question import worker requires OPENROUTER_API_KEY and AI_QUESTION_IMPORT_MODEL',
      );
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
    if (
      !batch ||
      ![
        'question-import-v2',
        'question-import-v3',
        'question-import-v4',
        'question-import-v5',
      ].includes(batch.schemaVersion)
    )
      return;
    const v4 =
      batch.schemaVersion === 'question-import-v4' ||
      batch.schemaVersion === 'question-import-v5';
    const v3 = batch.schemaVersion === 'question-import-v3' || v4;
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
          batch.inputType === 'ASSET' &&
          batch.sourceAsset.mimeType === 'application/pdf'
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
      // Materialize canonical root blocks before page splitting. Child windows
      // copy these keys so an overlap never changes a source range identity.
      let blocks = current.sourceBlocks;
      if (!blocks.length)
        blocks = await this.ensureSourceBlocks(batch, current);
      if (this.needsPageSplit(current.normalizedText)) {
        const children = this.pageChildren(current.normalizedText);
        if (children && !batch.parentId) {
          if (batch.children.length)
            await Promise.all(
              batch.children.map((child: any) => this.queue.enqueue(child.id)),
            );
          else await this.createChildren(batch, children, blocks);
          return;
        }
        throw new Error(
          'Source exceeds the segmentation token threshold and has no safe PDF page boundaries for automatic splitting.',
        );
      }
      if (!current.segmentationRawOutput) {
        await this.prisma.questionImportBatch.update({
          where: { id: batchId },
          data: { status: QuestionImportStatus.SEGMENTING },
        });
        const scope = current.pageScope as any;
        const rootBatchId = batch.parentId ?? batch.id;
        const segmentationMedia: any[] = v4
          ? await this.prisma.questionImportMedia.findMany({
              where: { batchId: rootBatchId },
              select: {
                mediaKey: true,
                pageNumber: true,
                type: true,
                normalizedBounds: true,
                description: true,
                status: true,
                asset: { select: { status: true } },
              },
            })
          : [];
        const segmentationBlocks = blocks.map((b: any) => ({
          key: b.blockKey,
          text: b.text,
          pageNumber: b.sourceLocator?.page ?? null,
          layout: b.assignment?.layoutReferences ?? [],
        }));
        const response = await (v3
          ? this.client.segmentSourceV3(
              segmentationBlocks,
              scope
                ? {
                    corePageStart: scope.corePageStart,
                    corePageEnd: scope.corePageEnd,
                  }
                : undefined,
              segmentationMedia.map((item) => ({
                mediaKey: item.mediaKey,
                pageNumber: item.pageNumber,
                type: item.type,
                normalizedBounds: item.normalizedBounds,
                description: item.description,
                readiness:
                  item.status === QuestionImportMediaStatus.ELIGIBLE &&
                  item.asset?.status === 'READY'
                    ? 'READY'
                    : String(item.status),
              })),
            )
          : this.client.segmentSource(
              segmentationBlocks,
              scope
                ? {
                    corePageStart: scope.corePageStart,
                    corePageEnd: scope.corePageEnd,
                  }
                : undefined,
            ));
        const normalized = this.normalizeContexts(blocks, response.result);
        response.result = this.limitToOwnedPages(
          blocks,
          normalized.result,
          scope,
        );
        response.result.warnings = [
          ...response.result.warnings,
          ...normalized.diagnostics,
        ];
        const issue = this.validateSegmentation(blocks, response.result);
        if (issue) {
          await this.prisma.questionImportBatch.update({
            where: { id: batchId },
            data: {
              segmentationRawOutput: response.raw as any,
              segmentationUsage: response.usage as any,
              segmentationWarnings: response.result.warnings as any,
            },
          });
          throw new Error(issue);
        }
        await this.persistSegmentationAndChunks(
          batchId,
          blocks,
          response,
          v3,
          v4,
        );
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
      const reviewRequired = await this.prisma.questionImportItem.count({
        where: { batchId, status: QuestionImportItemStatus.REVIEW_REQUIRED },
      });
      const failed = await this.prisma.questionImportChunk.count({
        where: { batchId, status: QuestionImportChunkStatus.FAILED },
      });
      await this.prisma.questionImportBatch.update({
        where: { id: batchId },
        data: {
          status: failed
            ? QuestionImportStatus.COMPLETED_WITH_ERRORS
            : reviewRequired
              ? QuestionImportStatus.AWAITING_REVIEW
              : invalid
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
  private transcriptionFailure(error: any, mode: string) {
    const provider = error instanceof OpenRouterQuestionImportError;
    return {
      mode,
      message: error instanceof Error ? error.message : String(error),
      raw: provider
        ? error.rawResponse
        : { message: error instanceof Error ? error.message : String(error) },
      usage: provider ? error.usage : null,
    };
  }
  private async transcribePageWithRecovery(
    original: Buffer,
    pageNumber: number,
  ) {
    const attempts: any[] = [];
    const fallbackModel = this.config.pdfTranscriptionFallbackModel;
    const plan = [
      {
        mode: 'PRIMARY' as const,
        dpi: 350,
        model: this.config.pdfTranscriptionModel,
      },
      {
        mode: 'STRICT_RETRY' as const,
        dpi: 250,
        model: this.config.pdfTranscriptionModel,
      },
      ...(fallbackModel && fallbackModel !== this.config.pdfTranscriptionModel
        ? [{ mode: 'FALLBACK' as const, dpi: 250, model: fallbackModel }]
        : []),
    ];
    let lastError: unknown = null;
    for (const attempt of plan) {
      try {
        const image = await this.pdfRanges.renderPage(
          original,
          pageNumber,
          attempt.dpi,
        );
        const initial = await this.transcriber.transcribeImage(image, {
          mode: attempt.mode,
          model: attempt.model,
        });
        attempts.push({
          mode: attempt.mode,
          dpi: attempt.dpi,
          model: attempt.model,
          raw: initial.raw,
          usage: initial.usage,
          outcome: 'SUCCESS',
        });
        return { image, initial, attempts };
      } catch (error: any) {
        lastError = error;
        attempts.push({
          ...attempt,
          outcome: 'FAILED',
          ...this.transcriptionFailure(error, attempt.mode),
        });
      }
    }
    throw new OpenRouterQuestionImportError(
      'PDF transcription failed after all page recovery attempts',
      { attempts },
      lastError instanceof OpenRouterQuestionImportError
        ? lastError.usage
        : null,
    );
  }
  private async transcribePdf(
    batch: any,
  ): Promise<{ text: string; metadata: any }> {
    if (!this.config.pdfTranscriptionModel)
      throw new Error('PDF imports require AI_PDF_TRANSCRIPTION_MODEL');
    const original = await this.storage.download(batch.sourceAsset.storageKey);
    const totalPages = await this.pdfRanges.pageCount(original);
    await this.prisma.questionImportBatch.update({
      where: { id: batch.id },
      data: { status: QuestionImportStatus.TRANSCRIBING },
    });
    // Layer 1 is deliberately neutral: every physical page is OCR'd.  Layer 2
    // receives the complete marked source and decides what is a question,
    // context, or excluded material.
    await this.prisma.questionImportPage.createMany({
      data: Array.from({ length: totalPages }, (_, index) => ({
        batchId: batch.id,
        pageNumber: index + 1,
      })),
      skipDuplicates: true,
    });
    const existing: any[] = await this.prisma.questionImportPage.findMany({
      where: { batchId: batch.id },
      orderBy: { pageNumber: 'asc' },
    });
    for (const stored of existing) {
      // A page-specific retry changes only that page back to PENDING. Keep the
      // persisted evidence for every other failed or review-required page.
      if (stored.status !== 'PENDING') continue;
      try {
        const recovered = await this.transcribePageWithRecovery(
          original,
          stored.pageNumber,
        );
        const image = recovered.image;
        const initial = recovered.initial;
        const initialCanonicalText = this.canonicalPageText(
          initial.page.content,
        );
        const suspicious =
          initial.page.confidence < 0.9 ||
          initial.page.uncertainSpans.length > 0 ||
          initial.page.warnings.length > 0 ||
          !initialCanonicalText;
        let verified: any = null;
        let verificationFailure: any = null;
        if (suspicious) {
          try {
            verified = await this.transcriber.verifyImage(image, initial.page);
          } catch (error: any) {
            verificationFailure = this.transcriptionFailure(
              error,
              'VERIFICATION',
            );
          }
        }
        const finalPage = verified?.page ?? initial.page;
        const canonicalText = this.canonicalPageText(finalPage.content);
        const priorAttemptTrace = Array.isArray(
          (stored.rawProviderResponse as any)?.attempts,
        )
          ? (stored.rawProviderResponse as any).attempts
          : stored.rawProviderResponse
            ? [{ mode: 'PREVIOUS_ATTEMPT', raw: stored.rawProviderResponse }]
            : [];
        let visualFailure: string | null = null;
        try {
          await this.media.materializePage(
            batch,
            stored.pageNumber,
            image,
            finalPage.visualRegions ?? [],
            verified?.raw ?? initial.raw,
          );
        } catch (error: any) {
          // A visual crop failure must never discard an otherwise usable OCR
          // page.  It remains visible in page review and can be retried from
          // the media API without regenerating text candidates.
          visualFailure = error.message.slice(0, 500);
        }
        const warnings = [
          ...finalPage.warnings,
          ...(verificationFailure
            ? [
                'OCR verification failed; retained the initial transcription for review.',
              ]
            : []),
          ...(visualFailure
            ? [`Visual extraction failed: ${visualFailure}`]
            : []),
        ];
        const review =
          finalPage.uncertainSpans.length > 0 ||
          warnings.length > 0 ||
          !canonicalText;
        await this.prisma.questionImportPage.update({
          where: {
            batchId_pageNumber: {
              batchId: batch.id,
              pageNumber: stored.pageNumber,
            },
          },
          data: {
            status: review ? 'REVIEW_REQUIRED' : 'AI_TRANSCRIBED',
            aiText: finalPage.content,
            canonicalText,
            confidence: finalPage.confidence,
            uncertainSpans: finalPage.uncertainSpans as any,
            warnings: warnings as any,
            layoutEnvelopes: (finalPage.layoutEnvelopes ?? []) as any,
            rawProviderResponse: {
              attempts: [...priorAttemptTrace, ...recovered.attempts],
              verification:
                verificationFailure ??
                (verified
                  ? { raw: verified.raw, usage: verified.usage }
                  : null),
            } as any,
            usage: {
              initial: initial.usage,
              verification: verified?.usage ?? null,
            } as any,
            initialAiText: initial.page.content,
            initialCanonicalText,
            initialProviderResponse: initial.raw as any,
            initialUsage: initial.usage as any,
            verificationProviderResponse: verified?.raw as any,
            verificationUsage: verified?.usage as any,
            verifiedAt: verified ? new Date() : null,
            errorDetail: review
              ? 'Visual OCR transcription requires admin review'
              : null,
            attemptCount: { increment: 1 },
          },
        });
      } catch (error: any) {
        const failure = this.transcriptionFailure(error, 'PRIMARY');
        await this.prisma.questionImportPage.update({
          where: {
            batchId_pageNumber: {
              batchId: batch.id,
              pageNumber: stored.pageNumber,
            },
          },
          data: {
            status: 'REVIEW_REQUIRED',
            warnings: [`OCR transcription failed: ${failure.message}`] as any,
            rawProviderResponse: (error instanceof OpenRouterQuestionImportError
              ? error.rawResponse
              : failure) as any,
            usage: failure.usage as any,
            errorDetail: error.message.slice(0, 2000),
            attemptCount: { increment: 1 },
          },
        });
      }
    }
    const pages: any[] = await this.prisma.questionImportPage.findMany({
      where: { batchId: batch.id },
      orderBy: { pageNumber: 'asc' },
    });
    const unresolved = pages.filter((page) => page.status !== 'AI_TRANSCRIBED');
    const usablePages = pages.filter((page) =>
      Boolean((page.canonicalText ?? page.aiText)?.trim()),
    );
    if (!usablePages.length)
      throw new Error('PDF transcription produced no usable page text');
    return {
      text: usablePages
        .map(
          (page) =>
            `[Page ${page.pageNumber}]\n${(page.canonicalText ?? page.aiText).trim()}`,
        )
        .join('\n\n'),
      metadata: {
        format: 'VISUAL_PDF_OCR',
        unresolvedPages: unresolved.map((page) => page.pageNumber),
        omittedPages: pages
          .filter((page) => !(page.canonicalText ?? page.aiText)?.trim())
          .map((page) => page.pageNumber),
        pages: pages.map((page) => ({
          page: page.pageNumber,
          confidence: page.confidence,
          status: page.status,
          lineCount: (page.canonicalText ?? page.aiText ?? '')
            .split('\n')
            .filter(Boolean).length,
        })),
      },
    };
  }
  private canonicalPageText(value: string) {
    return value
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
  private sourceBlockParts(text: string) {
    let page: number | null = null;
    let pageLine = 0;
    return text
      .split('\n')
      .map((value: string, line: number) => {
        const valueText = value.trim();
        const marker = /^\[Page (\d+)]$/.exec(valueText);
        if (marker) {
          page = Number(marker[1]);
          pageLine = 0;
        } else if (valueText && page !== null) pageLine += 1;
        return {
          text: valueText,
          sourceLocator:
            page === null
              ? { line: line + 1 }
              : marker
                ? { page }
                : { page, line: pageLine },
        };
      })
      .filter((part: any) => Boolean(part.text));
  }
  private normalizedAlignmentText(value: string) {
    return this.canonicalPageText(value)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  /**
   * Maps OCR envelopes once, in source order, on each physical page. Unlike
   * the old first-substring lookup this never reuses a matching option label
   * from an earlier column; ambiguity is intentionally left unmapped.
   */
  private alignLayoutReferences(parts: any[], layoutPages: any[]) {
    const references = new Map<number, any[]>();
    const pageNumbers = [
      ...new Set(parts.map((part) => part.sourceLocator?.page).filter(Boolean)),
    ] as number[];
    for (const pageNumber of pageNumbers) {
      const pageParts = parts.filter(
        (part) => part.sourceLocator?.page === pageNumber,
      );
      const envelopes = (
        (layoutPages.find((item: any) => item.pageNumber === pageNumber)
          ?.layoutEnvelopes ?? []) as any[]
      )
        .filter((item) => item?.text && item?.bounds)
        // OCR source order is RTL for the supported exam corpus: within a
        // horizontal band consume the right-most envelope first.
        .sort(
          (a, b) =>
            a.bounds.top - b.bounds.top ||
            b.bounds.right - a.bounds.right ||
            String(a.kind).localeCompare(String(b.kind)),
        );
      let cursor = 0;
      for (const part of pageParts) {
        const blockText = this.normalizedAlignmentText(part.text);
        if (!blockText || /^page \d+$/i.test(blockText)) continue;
        const matches: any[] = [];
        for (let index = cursor; index < envelopes.length; index += 1) {
          const envelopeText = this.normalizedAlignmentText(
            envelopes[index].text ?? '',
          );
          if (!envelopeText) continue;
          if (
            envelopeText.includes(blockText) ||
            blockText.includes(envelopeText)
          )
            matches.push({ index, envelope: envelopes[index] });
          // A later unmatched envelope can still cover a later OCR line. Do
          // not advance the cursor until an actual ordered match is found.
          if (
            matches.length &&
            index > matches[0].index &&
            !blockText.includes(envelopeText)
          )
            break;
        }
        if (!matches.length) continue;
        const first = matches[0].index;
        const contiguous = matches.filter(
          (item) =>
            item.index === first ||
            item.envelope.kind === 'OPTION' ||
            item.envelope.kind === 'OPTION_GROUP',
        );
        const compact = contiguous.map(({ envelope }) => ({
          kind: envelope.kind,
          bounds: envelope.bounds,
          optionIndex: envelope.optionIndex ?? null,
        }));
        references.set(parts.indexOf(part), compact);
        cursor = first + 1;
      }
    }
    return references;
  }
  private async ensureSourceBlocks(batch: any, current: any) {
    const rootBatchId = batch.parentId ?? batch.id;
    const layoutPages: any[] =
      current.schemaVersion === 'question-import-v5'
        ? await this.prisma.questionImportPage.findMany({
            where: { batchId: rootBatchId },
            select: { pageNumber: true, layoutEnvelopes: true },
          })
        : [];
    const parts = this.sourceBlockParts(current.normalizedText);
    const aligned = this.alignLayoutReferences(parts, layoutPages);
    return Promise.all(
      parts.map((part: any, index: number) => {
        const layoutReferences = aligned.get(index) ?? [];
        return this.prisma.questionImportSourceBlock.create({
          data: {
            batchId: batch.id,
            sequence: index + 1,
            blockKey: `B${String(index + 1).padStart(5, '0')}`,
            text: part.text,
            sourceLocator: part.sourceLocator,
            // Preserve one preferred envelope for visual-review geometry; compact
            // references are what segmentation receives.
            envelope:
              layoutReferences.find(
                (reference) => reference.kind === 'QUESTION_STEM',
              ) ??
              layoutReferences[0] ??
              null,
            assignment: layoutReferences.length
              ? { layoutReferences }
              : Prisma.JsonNull,
          },
        });
      }),
    );
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
        errorDetail:
          'Recovered after the worker lease expired before chunk completion',
      },
    });
  }
  private pageChildren(
    text: string,
  ): Array<{ text: string; scope: Record<string, number> }> | null {
    const matches = [...text.matchAll(/^\[Page (\d+)]\s*$/gm)];
    if (matches.length < 2) return null;
    const pages = matches.map((match, index) => ({
      page: Number(match[1]),
      text: text.slice(match.index!, matches[index + 1]?.index).trim(),
      tokens: 0,
    }));
    if (
      pages.some(
        (page, index) =>
          !page.text || (index && page.page !== pages[index - 1].page + 1),
      )
    )
      return null;
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
      while (
        pages
          .slice(first, last + 1)
          .reduce((size, page) => size + page.tokens, 0) > target
      ) {
        if (first < core.first) first += 1;
        else if (last > core.last) last -= 1;
        else return null;
      }
      children.push({
        text: pages
          .slice(first, last + 1)
          .map((page) => page.text)
          .join('\n\n'),
        scope: {
          includedPageStart: pages[first].page,
          includedPageEnd: pages[last].page,
          corePageStart: pages[core.first].page,
          corePageEnd: pages[core.last].page,
          coreTokenCount: pages
            .slice(core.first, core.last + 1)
            .reduce((size, page) => size + page.tokens, 0),
          includedTokenCount: pages
            .slice(first, last + 1)
            .reduce((size, page) => size + page.tokens, 0),
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
    return (
      this.estimateTokens(text) > this.config.segmentationSplitThresholdTokens
    );
  }
  private async createChildren(
    batch: any,
    children: Array<{ text: string; scope: Record<string, number> }>,
    rootBlocks: any[],
  ) {
    const created = await this.prisma.$transaction(async (tx: any) =>
      Promise.all(
        children.map((child, index) => {
          const sourceBlocks = rootBlocks.filter((block) => {
            const page = block.sourceLocator?.page;
            return (
              page == null ||
              (page >= child.scope.includedPageStart &&
                page <= child.scope.includedPageEnd)
            );
          });
          return tx.questionImportBatch.create({
            data: {
              inputType: 'RAW_TEXT',
              rawText: child.text,
              normalizedText: child.text,
              extractionMetadata: {
                format: 'PDF_PAGE_CHUNK',
                pageScope: child.scope,
              },
              parentId: batch.id,
              childSequence: index + 1,
              pageScope: child.scope,
              bankId: batch.bankId,
              sourceId: batch.sourceId,
              courseId: batch.courseId,
              placements: batch.placements,
              model: batch.model,
              schemaVersion: batch.schemaVersion,
              createdById: batch.createdById,
              sourceBlocks: {
                create: sourceBlocks.map((block, sequence) => ({
                  sequence: sequence + 1,
                  blockKey: block.blockKey,
                  text: block.text,
                  sourceLocator: block.sourceLocator,
                  envelope: block.envelope,
                  assignment: block.assignment,
                })),
              },
            },
          });
        }),
      ),
    );
    await this.prisma.questionImportBatch.update({
      where: { id: batch.id },
      data: {
        status: QuestionImportStatus.GENERATING,
        totalChunks: created.length,
        startedAt: batch.startedAt ?? new Date(),
      },
    });
    await Promise.all(
      created.map((child: any) => this.queue.enqueue(child.id)),
    );
  }
  private async refreshParent(parentId: string) {
    const children: any[] = await this.prisma.questionImportBatch.findMany({
      where: { parentId },
    });
    if (
      !children.length ||
      children.some(
        (child) =>
          ![
            QuestionImportStatus.COMPLETED,
            QuestionImportStatus.COMPLETED_WITH_ERRORS,
            QuestionImportStatus.FAILED,
            QuestionImportStatus.AWAITING_REVIEW,
          ].includes(child.status),
      )
    )
      return;
    const failed = children.filter(
      (child) => child.status !== QuestionImportStatus.COMPLETED,
    ).length;
    await this.prisma.questionImportBatch.update({
      where: { id: parentId },
      data: {
        status: failed
          ? QuestionImportStatus.COMPLETED_WITH_ERRORS
          : QuestionImportStatus.COMPLETED,
        completedAt: new Date(),
        completedChunks: children.length,
        totalItems: children.reduce((sum, child) => sum + child.totalItems, 0),
        createdQuestions: children.reduce(
          (sum, child) => sum + child.createdQuestions,
          0,
        ),
        invalidItems: children.reduce(
          (sum, child) => sum + child.invalidItems,
          0,
        ),
        failedItems: children.reduce(
          (sum, child) => sum + child.failedItems,
          0,
        ),
        errorSummary: failed
          ? `${failed} page range(s) require review or retry`
          : null,
      },
    });
  }
  private pageForBlock(blocks: any[], blockKey: string) {
    const index = blocks.findIndex((block) => block.blockKey === blockKey);
    for (let i = index; i >= 0; i -= 1) {
      const match = /^\[Page (\d+)]$/.exec(blocks[i].text);
      if (match) return Number(match[1]);
    }
    return null;
  }
  private limitToOwnedPages(
    blocks: any[],
    result: SegmentationResult,
    scope?: { corePageStart: number; corePageEnd: number },
  ) {
    if (!scope) return result;
    const owned = (firstBlock: string) => {
      const page = this.pageForBlock(blocks, firstBlock);
      return (
        page !== null &&
        page >= scope.corePageStart &&
        page <= scope.corePageEnd
      );
    };
    const questions = result.questions.filter((question) => {
      const page = this.pageForBlock(blocks, question.firstBlock);
      if (!owned(question.firstBlock)) return false;
      question.page = page;
      return true;
    });
    // A child only persists contexts it actually owns through at least one
    // stem on its core pages. Their eligibility was already checked against
    // the complete included overlap window above.
    const referencedContexts = new Set(
      questions.flatMap((question: any) => question.contextIds ?? []),
    );
    const contexts = result.contexts.filter((context) =>
      referencedContexts.has(context.id),
    );
    if ('answerEvidence' in result) {
      const typed = result as SegmentationResultV3;
      const questionIds = new Set(questions.map((question) => question.id));
      const answerEvidence = typed.answerEvidence
        .map((item) => ({
          ...item,
          questionIds: item.questionIds.filter((id: string) =>
            questionIds.has(id),
          ),
        }))
        .filter((item) => item.questionIds.length);
      const keys = new Set(answerEvidence.map((item) => item.evidenceKey));
      return {
        ...typed,
        contexts,
        questions: questions.map((question: any) => ({
          ...question,
          evidenceKeys: question.evidenceKeys.filter((key: string) =>
            keys.has(key),
          ),
        })),
        answerEvidence,
        excluded: typed.excluded.filter((item) => owned(item.firstBlock)),
        skippedRanges: (typed.skippedRanges ?? []).filter((item) =>
          owned(item.firstBlock),
        ),
      };
    }
    return {
      ...result,
      contexts,
      questions,
      excluded: result.excluded.filter((item) => owned(item.firstBlock)),
      skippedRanges: (result.skippedRanges ?? []).filter((item) =>
        owned(item.firstBlock),
      ),
    };
  }
  private contextIdentity(context: any) {
    return `CTX_${context.type}_${context.firstBlock}_${context.lastBlock}`;
  }
  private rangesIntersect(
    left: { first: number; last: number },
    right: { first: number; last: number },
  ) {
    return left.first <= right.last && right.first <= left.last;
  }
  private contextCue(text: string) {
    return /\b(?:passage|table|figure|diagram|chart|map|equation|following|above|below)\b|(?:النص|القطعة|الجدول|الشكل|الرسم|الخريطة|المخطط|المعادلة|السابق|التالي)/i.test(
      text,
    );
  }
  /**
   * Contexts are a derived, server-owned contract. The model's response is
   * retained untouched, but every rejected claim is removed independently so
   * unrelated questions can still proceed without a shared context.
   */
  private normalizeContexts(
    blocks: any[],
    input: SegmentationResult | SegmentationResultV3,
  ) {
    const result: any = {
      ...input,
      contexts: (input.contexts ?? []).map((context: any) => ({ ...context })),
      questions: (input.questions ?? []).map((question: any) => ({
        ...question,
        contextIds: [...(question.contextIds ?? [])],
      })),
    };
    const diagnostics: string[] = [];
    const keys = blocks.map((block) => block.blockKey);
    const range = (firstBlock: string, lastBlock: string) => {
      const first = keys.indexOf(firstBlock),
        last = keys.indexOf(lastBlock);
      return first < 0 || last < first ? null : { first, last };
    };
    const reasonById = new Map<string, string>();
    const reject = (id: string, reason: string) => {
      if (!reasonById.has(id)) reasonById.set(id, reason);
    };
    const counts = new Map<string, number>();
    for (const context of result.contexts)
      counts.set(context.id, (counts.get(context.id) ?? 0) + 1);
    for (const context of result.contexts) {
      const contextRange = range(context.firstBlock, context.lastBlock);
      if (!context.id || (counts.get(context.id) ?? 0) !== 1)
        reject(context.id, 'INVALID_OR_DUPLICATE_ID');
      else if (!contextRange) reject(context.id, 'INVALID_RANGE');
    }
    const validQuestionRanges = result.questions
      .map((question: any) => ({
        question,
        value: range(question.firstBlock, question.lastBlock),
      }))
      .filter((item: any) => item.value);
    const excludedRanges = (result.excluded ?? [])
      .map((item: any) => range(item.firstBlock, item.lastBlock))
      .filter(Boolean);
    const answerEvidenceRanges = (
      'answerEvidence' in result ? result.answerEvidence : []
    )
      .map((item: any) => range(item.firstBlock, item.lastBlock))
      .filter(Boolean);
    for (const context of result.contexts) {
      const contextRange = range(context.firstBlock, context.lastBlock);
      if (!contextRange || reasonById.has(context.id)) continue;
      if (
        validQuestionRanges.some((item: any) =>
          this.rangesIntersect(contextRange, item.value),
        ) ||
        excludedRanges.some((item: any) =>
          this.rangesIntersect(contextRange, item),
        )
      ) {
        reject(context.id, 'OVERLAPS_QUESTION_OR_EXCLUDED_RANGE');
        continue;
      }
      if (
        answerEvidenceRanges.some((item: any) =>
          this.rangesIntersect(contextRange, item),
        )
      ) {
        reject(context.id, 'CONTAINS_ANSWER_EVIDENCE');
        continue;
      }
      const layout = blocks
        .slice(contextRange.first, contextRange.last + 1)
        .flatMap((block) => block.assignment?.layoutReferences ?? []);
      if (
        layout.some((item: any) =>
          ['QUESTION_STEM', 'OPTION_GROUP', 'OPTION'].includes(item.kind),
        )
      ) {
        reject(context.id, 'CONTAINS_QUESTION_OR_OPTION_LAYOUT');
        continue;
      }
      const text = blocks
        .slice(contextRange.first, contextRange.last + 1)
        .map((block) => block.text)
        .join(' ')
        .trim();
      if (
        /(?:^|\s)(?:answer\s*(?:key|sheet)|answers?|الإجابات|نموذج\s*الإجابة|مفتاح\s*الإجابة)(?:\s|:|$)/i.test(
          text,
        )
      ) {
        reject(context.id, 'CONTAINS_ANSWER_KEY_CONTENT');
        continue;
      }
      if (
        context.type === 'TEXT' &&
        /^(?:[\d\s.:-]*|(?:chapter|lesson|unit|exercise|section|موضوع|درس|الوحدة|تدريب|اختر)[\s\S]{0,90})$/i.test(
          text,
        )
      )
        reject(context.id, 'HEADING_OR_TOPIC_LABEL');
    }
    for (let left = 0; left < result.contexts.length; left += 1)
      for (let right = left + 1; right < result.contexts.length; right += 1) {
        const a = result.contexts[left],
          b = result.contexts[right];
        const aRange = range(a.firstBlock, a.lastBlock),
          bRange = range(b.firstBlock, b.lastBlock);
        if (aRange && bRange && this.rangesIntersect(aRange, bRange)) {
          reject(a.id, 'OVERLAPS_ANOTHER_CONTEXT');
          reject(b.id, 'OVERLAPS_ANOTHER_CONTEXT');
        }
      }
    const known = new Set(result.contexts.map((context: any) => context.id));
    const consumers = new Map<string, Set<string>>();
    for (const question of result.questions) {
      const seen = new Set<string>();
      for (const id of question.contextIds) {
        if (seen.has(id)) reject(id, 'DUPLICATE_CONTEXT_LINK');
        seen.add(id);
        if (known.has(id)) {
          let ids = consumers.get(id);
          if (!ids) {
            ids = new Set<string>();
            consumers.set(id, ids);
          }
          ids.add(question.id);
        }
      }
    }
    for (const context of result.contexts) {
      const count = consumers.get(context.id)?.size ?? 0;
      if (!count) reject(context.id, 'UNREFERENCED');
      else if (count < 2) reject(context.id, 'FEWER_THAN_TWO_CONSUMERS');
    }
    const rejectedRanges = new Map<
      string,
      { first: number; last: number } | null
    >(
      result.contexts.map((context: any) => [
        context.id,
        range(context.firstBlock, context.lastBlock),
      ]),
    );
    const retained = result.contexts
      .filter((context: any) => !reasonById.has(context.id))
      .map((context: any) => ({
        ...context,
        id: this.contextIdentity(context),
      }));
    const retainedIds = new Set(retained.map((context: any) => context.id));
    const identityByOldId = new Map(
      result.contexts
        .filter((context: any) => !reasonById.has(context.id))
        .map((context: any) => [context.id, this.contextIdentity(context)]),
    );
    for (const question of result.questions) {
      const removed = question.contextIds.filter(
        (id: string) => reasonById.has(id) || !known.has(id),
      );
      question.contextIds = [
        ...new Set(
          question.contextIds
            .map((id: string) => identityByOldId.get(id))
            .filter((id: string | undefined): id is string => Boolean(id)),
        ),
      ];
      if (removed.length) {
        const questionRange = range(question.firstBlock, question.lastBlock);
        const nearbyEvidence = removed.some((id: string) => {
          const rejected = rejectedRanges.get(id);
          if (!questionRange || !rejected) return false;
          const nearby =
            Math.max(
              0,
              Math.max(
                rejected.first - questionRange.last,
                questionRange.first - rejected.last,
              ),
            ) <= 2;
          const layout = blocks
            .slice(
              Math.max(0, rejected.first - 1),
              Math.min(blocks.length, rejected.last + 2),
            )
            .flatMap((block) => block.assignment?.layoutReferences ?? []);
          return (
            nearby &&
            layout.some((item: any) =>
              ['TABLE', 'SHARED_CONTEXT'].includes(item.kind),
            )
          );
        });
        if (
          this.contextCue(
            blocks
              .slice(questionRange?.first ?? 0, (questionRange?.last ?? -1) + 1)
              .map((block) => block.text)
              .join(' '),
          ) ||
          nearbyEvidence
        ) {
          question.contextUnresolved = true;
          question.contextDiagnostics = removed.map(
            (id: string) =>
              `CONTEXT_UNRESOLVED:${id}:${reasonById.get(id) ?? 'UNKNOWN_CONTEXT'}`,
          );
        }
      }
    }
    for (const [id, reason] of reasonById)
      diagnostics.push(`CONTEXT_REJECTED:${id}:${reason}`);
    result.contexts = retained;
    // All links were rebuilt from questions; do not permit a context that no
    // longer exists after identity normalization.
    result.questions = result.questions.map((question: any) => ({
      ...question,
      contextIds: question.contextIds.filter((id: string) =>
        retainedIds.has(id),
      ),
    }));
    return { result, diagnostics };
  }
  private validateSegmentation(
    blocks: any[],
    result: SegmentationResult | SegmentationResultV3,
  ) {
    if (
      result.warnings.some((warning) =>
        /(?:continues|additional).{0,80}(?:beyond|omitted)|only the extracted/i.test(
          warning,
        ),
      )
    ) {
      return 'AI reported incomplete source coverage; reduce the segmentation range and retry.';
    }
    const keys = blocks.map((b) => b.blockKey);
    const range = (firstBlock: string, lastBlock: string) => {
      const first = keys.indexOf(firstBlock),
        last = keys.indexOf(lastBlock);
      return first < 0 || last < first ? null : { first, last };
    };
    const contextIds = new Set<string>();
    for (const context of result.contexts) {
      if (
        contextIds.has(context.id) ||
        !range(context.firstBlock, context.lastBlock)
      )
        return 'AI returned invalid context metadata.';
      contextIds.add(context.id);
    }
    const questionRanges = new Set<string>();
    const questionIds = new Set<string>();
    let previous = -1;
    for (const question of result.questions) {
      const r = range(question.firstBlock, question.lastBlock);
      if (
        !question.id ||
        questionIds.has(question.id) ||
        !r ||
        r.first <= previous ||
        !question.sourceNumber ||
        question.contextIds.some((id) => !contextIds.has(id))
      )
        return 'AI returned invalid question boundaries or context references.';
      questionIds.add(question.id);
      for (let i = r.first; i <= r.last; i += 1) {
        if (questionRanges.has(keys[i]))
          return 'AI returned overlapping question boundaries.';
        questionRanges.add(keys[i]);
      }
      previous = r.last;
    }
    if ('answerEvidence' in result) {
      const questionIds = new Set(
        result.questions.map((question) => question.id),
      );
      const evidenceKeys = new Set<string>();
      for (const evidence of result.answerEvidence) {
        if (
          !evidence.evidenceKey ||
          evidenceKeys.has(evidence.evidenceKey) ||
          !range(evidence.firstBlock, evidence.lastBlock) ||
          !evidence.questionIds.length ||
          evidence.questionIds.some((id) => !questionIds.has(id))
        )
          return 'AI returned invalid answer-evidence metadata.';
        evidenceKeys.add(evidence.evidenceKey);
      }
      if (
        result.questions.some((question) =>
          question.evidenceKeys.some((key) => !evidenceKeys.has(key)),
        )
      )
        return 'AI returned an unknown answer-evidence reference.';
      if (
        result.questions.some((question) => {
          const declared = new Set(question.evidenceKeys);
          const indexed = result.answerEvidence
            .filter((evidence) => evidence.questionIds.includes(question.id))
            .map((evidence) => evidence.evidenceKey);
          return (
            declared.size !== indexed.length ||
            indexed.some((key) => !declared.has(key))
          );
        })
      )
        return 'AI returned inconsistent question answer-evidence references.';
    }
    if (
      !result.excluded.every((item) =>
        Boolean(range(item.firstBlock, item.lastBlock)),
      )
    )
      return 'AI returned invalid excluded-source metadata.';
    return (result.skippedRanges ?? []).every((item) =>
      Boolean(range(item.firstBlock, item.lastBlock)),
    )
      ? null
      : 'AI returned invalid skipped-source metadata.';
  }
  private extractionChunks(
    batchId: string,
    blocks: any[],
    result: SegmentationResult,
    contextIdMap: Map<string, string>,
    media: any[] = [],
    v4 = false,
  ) {
    const keys = blocks.map((b) => b.blockKey);
    const contexts = new Map(
      result.contexts.map((context) => {
        const first = keys.indexOf(context.firstBlock),
          last = keys.indexOf(context.lastBlock);
        return [
          context.id,
          {
            id: v4 ? context.id : contextIdMap.get(context.id)!,
            title: context.title ?? null,
            type: context.type,
            text: blocks
              .slice(first, last + 1)
              .map((b: any) => b.text)
              .join('\n'),
          },
        ];
      }),
    );
    const complete = result.questions
      .filter((question) =>
        [
          'SINGLE_CHOICE',
          'MULTIPLE_CHOICE',
          'SHORT_ANSWER',
          'FILL_IN_THE_BLANK',
          'LONG_ANSWER',
        ].includes(question.detectedType),
      )
      .map((question: any) => {
        const first = keys.indexOf(question.firstBlock),
          last = keys.indexOf(question.lastBlock);
        return {
          id: question.id,
          firstBlock: question.firstBlock,
          lastBlock: question.lastBlock,
          text: blocks
            .slice(first, last + 1)
            .map((b: any) => b.text)
            .join('\n'),
          sourceNumber: question.sourceNumber,
          section: question.section,
          page: question.page,
          pageNumbers: [
            ...new Set(
              blocks
                .slice(first, last + 1)
                .map((block: any) => block.sourceLocator?.page)
                .filter(Boolean),
            ),
          ],
          envelope: this.mergeEnvelopes(
            blocks.slice(first, last + 1).map((block: any) => block.envelope),
          ),
          contextIds: question.contextIds.map((id: string) =>
            v4 ? id : contextIdMap.get(id)!,
          ),
          contextDbIds: question.contextIds.map((id: string) =>
            contextIdMap.get(id)!,
          ),
          contexts: question.contextIds
            .map((id: string) => contexts.get(id))
            .filter(Boolean),
          evidenceKeys: question.evidenceKeys ?? [],
          answerEvidence: question.answerEvidence ?? [],
          contextUnresolved: Boolean(question.contextUnresolved),
          contextDiagnostics: question.contextDiagnostics ?? [],
          locator: question,
        };
      });
    // V5 links visual evidence per candidate. A chunk with one question keeps
    // the media budget and its advertised crop bytes unambiguously scoped.
    if (v4)
      return complete.map((question, index) => ({
        batchId,
        sequence: index + 1,
        text: JSON.stringify(this.extractionInput([question], media, true)),
        sourceLocator: { ranges: [question.locator] },
        checksum: createHash('sha256')
          .update(JSON.stringify(question))
          .digest('hex'),
      }));
    const batches: any[] = [];
    let current: any[] = [];
    for (const question of complete) {
      const candidate = [...current, question];
      const input = this.extractionInput(candidate);
      if (
        current.length &&
        (current.length === this.config.extractionMaxQuestions ||
          this.estimateTokens(JSON.stringify(input)) + 4_000 >
            this.config.extractionTargetTokens)
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
      text: JSON.stringify(this.extractionInput(questions, media, v4)),
      sourceLocator: { ranges: questions.map((q: any) => q.locator) },
      checksum: createHash('sha256')
        .update(JSON.stringify(questions))
        .digest('hex'),
    }));
  }
  private extractionInput(questions: any[], media: any[] = [], v4 = false) {
    const contexts = new Map<string, any>();
    for (const question of questions)
      for (const context of question.contexts ?? [])
        contexts.set(context.id, context);
    // Contexts were attached above only long enough to build a chunk; strip them from every question payload.
    const evidence = new Map<string, any>();
    for (const question of questions)
      for (const item of question.answerEvidence ?? [])
        evidence.set(item.evidenceKey, item);
    const selectedPages = new Set<number>();
    for (const question of questions) {
      for (const page of question.pageNumbers ?? []) selectedPages.add(page);
      if (question.page) selectedPages.add(question.page);
    }
    const visibleMedia = media
      .filter(
        (item) => !selectedPages.size || selectedPages.has(item.pageNumber),
      )
      .map((item) => ({
        mediaKey: item.mediaKey,
        pageNumber: item.pageNumber,
        type: item.type,
        description: item.description,
        normalizedBounds: item.normalizedBounds,
        proximity: Math.min(
          ...questions
            .filter((question) =>
              !question.page || question.page === item.pageNumber,
            )
            .map((question) => this.visualProximity(question.envelope, item.normalizedBounds)),
          Number.MAX_SAFE_INTEGER,
        ),
      }));
    return {
      contexts: [...contexts.values()],
      answerEvidence: [...evidence.values()],
      ...(v4 ? { media: visibleMedia } : {}),
      questions: questions.map(
        ({
          contexts: _contexts,
          locator: _locator,
          answerEvidence,
          ...question
        }) => ({
          ...question,
          allowedEvidenceKeys: answerEvidence.map(
            (item: any) => item.evidenceKey,
          ),
          ...(v4 ? { media: visibleMedia } : {}),
        }),
      ),
    };
  }
  private mergeEnvelopes(values: any[]) {
    const bounds = values
      .map((value) => value?.bounds ?? value)
      .filter(
        (value) =>
          value &&
          [value.left, value.top, value.right, value.bottom].every(
            Number.isFinite,
          ),
      );
    if (!bounds.length) return null;
    return {
      left: Math.min(...bounds.map((value) => value.left)),
      top: Math.min(...bounds.map((value) => value.top)),
      right: Math.max(...bounds.map((value) => value.right)),
      bottom: Math.max(...bounds.map((value) => value.bottom)),
    };
  }
  private visualProximity(envelope: any, bounds: any) {
    if (!envelope || !bounds) return Number.MAX_SAFE_INTEGER / 2;
    const verticalGap = Math.max(
      0,
      bounds.top - envelope.bottom,
      envelope.top - bounds.bottom,
    );
    const horizontalGap = Math.max(
      0,
      bounds.left - envelope.right,
      envelope.left - bounds.right,
    );
    // Vertical alignment is the strongest signal in the RTL exam layouts:
    // diagrams commonly appear left of, rather than directly below, a stem.
    return verticalGap * 4 + horizontalGap;
  }
  private anchoredContentBlocks(
    text: string,
    assignments: any[],
    mediaByKey: Map<string, any>,
    matches: (assignment: any) => boolean,
  ) {
    const image = (assignment: any) => ({
      type: QuestionContentBlockType.IMAGE,
      assetId: mediaByKey.get(assignment.mediaKey).assetId,
      altText: assignment.reason.trim(),
    });
    const matching = assignments.filter(matches);
    const starts = matching.filter((assignment) => assignment.placementAnchor === 'START');
    const after = matching
      .filter((assignment) => assignment.placementAnchor?.startsWith('AFTER:'))
      .sort((a, b) => a.placementAnchor.localeCompare(b.placementAnchor));
    const ends = matching.filter(
      (assignment) => !assignment.placementAnchor || assignment.placementAnchor === 'END',
    );
    return [
      ...starts.map(image),
      ...(text ? [{ type: QuestionContentBlockType.TEXT, text }] : []),
      ...after.map(image),
      ...ends.map(image),
    ];
  }
  private async persistSegmentationAndChunks(
    batchId: string,
    blocks: any[],
    response: {
      result: SegmentationResult | SegmentationResultV3;
      raw: unknown;
      usage: unknown;
    },
    v3 = false,
    v4 = false,
  ) {
    let rootMedia: any[] = [];
    const batchInfo: any = v4
      ? await this.prisma.questionImportBatch.findUniqueOrThrow({
          where: { id: batchId },
          select: { id: true, parentId: true },
        })
      : null;
    const rootBatchId = batchInfo?.parentId ?? batchId;
    if (v4) {
      rootMedia = await this.prisma.questionImportMedia.findMany({
        where: {
          batchId: rootBatchId,
          status: QuestionImportMediaStatus.ELIGIBLE,
          asset: { is: { status: 'READY' } },
        },
        include: {
          asset: { select: { id: true, storageKey: true, mimeType: true } },
        },
      });
    }
    await this.prisma.$transaction(async (tx: any) => {
      const contextIdMap = new Map<string, string>();
      for (const context of response.result.contexts) {
        const keys = blocks.map((b) => b.blockKey);
        const first = keys.indexOf(context.firstBlock),
          last = keys.indexOf(context.lastBlock);
        if (!v4) {
          const created = await tx.questionContext.create({
            data: {
              type: context.type,
              title: context.title,
              body: blocks
                .slice(first, last + 1)
                .map((b: any) => b.text)
                .join('\n'),
              sourceLocator: {
                firstBlock: context.firstBlock,
                lastBlock: context.lastBlock,
              },
            },
          });
          contextIdMap.set(context.id, created.id);
          continue;
        }
        // The identity is derived from the original stable block range.  A
        // child import therefore attaches its owned question to the same
        // QuestionContext as an adjacent overlap window.
        let rootMapping = await tx.questionImportContext.findUnique({
          where: {
            batchId_contextKey: {
              batchId: rootBatchId,
              contextKey: context.id,
            },
          },
        });
        if (!rootMapping) {
          const created = await tx.questionContext.create({
            data: {
              type: context.type,
              title: context.title,
              body: blocks
                .slice(first, last + 1)
                .map((b: any) => b.text)
                .join('\n'),
              sourceLocator: {
                rootBatchId,
                firstBlock: context.firstBlock,
                lastBlock: context.lastBlock,
                contextKey: context.id,
              },
            },
          });
          rootMapping = await tx.questionImportContext.upsert({
            where: {
              batchId_contextKey: {
                batchId: rootBatchId,
                contextKey: context.id,
              },
            },
            create: {
              batchId: rootBatchId,
              contextKey: context.id,
              contextId: created.id,
              firstBlock: context.firstBlock,
              lastBlock: context.lastBlock,
            },
            update: {},
          });
          // Concurrent overlap windows may race to propose this identity. The
          // unique root mapping wins; discard the loser before commit.
          if (rootMapping.contextId !== created.id)
            await tx.questionContext.delete({ where: { id: created.id } });
        }
        contextIdMap.set(context.id, rootMapping.contextId);
        if (batchId !== rootBatchId)
          await tx.questionImportContext.upsert({
            where: { batchId_contextKey: { batchId, contextKey: context.id } },
            create: {
              batchId,
              contextKey: context.id,
              contextId: rootMapping.contextId,
              firstBlock: context.firstBlock,
              lastBlock: context.lastBlock,
            },
            update: {
              contextId: rootMapping.contextId,
              firstBlock: context.firstBlock,
              lastBlock: context.lastBlock,
            },
          });
      }
      const result: any = response.result;
      const evidence = v3 ? (result.answerEvidence ?? []) : [];
      const evidenceByQuestion = new Map<string, any[]>();
      for (const item of evidence) {
        for (const questionId of item.questionIds ?? []) {
          const rows = evidenceByQuestion.get(questionId) ?? [];
          rows.push(item);
          evidenceByQuestion.set(questionId, rows);
        }
      }
      const chunks = this.extractionChunks(
        batchId,
        blocks,
        {
          ...result,
          questions: result.questions.map((question: any) => ({
            ...question,
            answerEvidence: (evidenceByQuestion.get(question.id) ?? []).map(
              (item) => {
                const keys = blocks.map((block: any) => block.blockKey);
                const first = keys.indexOf(item.firstBlock),
                  last = keys.indexOf(item.lastBlock);
                return {
                  ...item,
                  text: blocks
                    .slice(first, last + 1)
                    .map((block: any) => block.text)
                    .join('\n'),
                };
              },
            ),
          })),
        },
        contextIdMap,
        rootMedia,
        v4,
      );
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
      if ((response.result.skippedRanges ?? []).length)
        await tx.questionImportSkippedRange.createMany({
          data: (response.result.skippedRanges ?? []).map(
            (range: any, index: number) => ({
              batchId,
              sequence: index + 1,
              firstBlock: range.firstBlock,
              lastBlock: range.lastBlock,
              reason: range.reason,
              sourceLocator: {
                firstBlock: range.firstBlock,
                lastBlock: range.lastBlock,
                first: blocks.find(
                  (block: any) => block.blockKey === range.firstBlock,
                )?.sourceLocator,
                last: blocks.find(
                  (block: any) => block.blockKey === range.lastBlock,
                )?.sourceLocator,
              },
            }),
          ),
        });
      if (evidence.length)
        await tx.questionImportAnswerEvidence.createMany({
          data: evidence.map((item: any) => {
            const keys = blocks.map((block: any) => block.blockKey);
            const first = keys.indexOf(item.firstBlock),
              last = keys.indexOf(item.lastBlock);
            return {
              batchId,
              evidenceKey: item.evidenceKey,
              firstBlock: item.firstBlock,
              lastBlock: item.lastBlock,
              text: blocks
                .slice(first, last + 1)
                .map((block: any) => block.text)
                .join('\n'),
              questionIds: item.questionIds,
              sourceLocator: {
                firstBlock: item.firstBlock,
                lastBlock: item.lastBlock,
                first: blocks[first]?.sourceLocator,
                last: blocks[last]?.sourceLocator,
              },
            };
          }),
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
      const input = JSON.parse(chunk.text);
      const questions = Array.isArray(input) ? input : input.questions;
      const v4 =
        batch.schemaVersion === 'question-import-v4' ||
        batch.schemaVersion === 'question-import-v5';
      const v3 = batch.schemaVersion === 'question-import-v3' || v4;
      const r = await (v4
        ? this.extractV4(
            batch,
            Array.isArray(input)
              ? { contexts: [], answerEvidence: [], media: [], questions }
              : input,
          )
        : v3
          ? this.client.extractQuestionsV3(
              Array.isArray(input)
                ? { contexts: [], answerEvidence: [], questions }
                : input,
            )
          : this.client.extractQuestions(
              Array.isArray(input) ? { contexts: [], questions } : input,
            ));
      if (r.items.length !== questions.length)
        throw new Error(
          'AI did not return exactly one structured item for each identified question',
        );
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: { rawResponse: r.raw as any, usage: r.usage as any },
      });
      const completedSequences = new Set(
        (
          await this.prisma.questionImportItem.findMany({
            where: { chunkId: chunk.id, questionId: { not: null } },
            select: { sequence: true },
          })
        ).map((item) => item.sequence),
      );
      for (let i = 0; i < r.items.length; i += 1)
        if (!completedSequences.has(i + 1))
          await this.createItem(
            batch,
            chunk,
            i + 1,
            r.items[i] as any,
            questions[i],
            v3,
            v4,
          );
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: {
          status: QuestionImportChunkStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (e: any) {
      const attemptCount = (chunk.attemptCount ?? 0) + 1;
      await this.prisma.questionImportChunk.update({
        where: { id: chunk.id },
        data: {
          status:
            attemptCount < QUESTION_IMPORT_CHUNK_MAX_ATTEMPTS
              ? QuestionImportChunkStatus.PENDING
              : QuestionImportChunkStatus.FAILED,
          rawResponse:
            e instanceof OpenRouterQuestionImportError
              ? (e.rawResponse as any)
              : undefined,
          usage:
            e instanceof OpenRouterQuestionImportError
              ? (e.usage as any)
              : undefined,
          errorDetail: e.message.slice(0, 2000),
        },
      });
    }
  }
  private async extractV4(batch: any, input: any) {
    const rootBatchId = batch.parentId ?? batch.id;
    const keys = (input.media ?? []).map((item: any) => item.mediaKey);
    const proximityByKey = new Map<string, number>(
      (input.media ?? []).map((item: any) => [
        item.mediaKey,
        Number.isFinite(item.proximity) ? item.proximity : Number.MAX_SAFE_INTEGER,
      ] as [string, number]),
    );
    const rows: any[] = keys.length
      ? await this.prisma.questionImportMedia.findMany({
          where: {
            batchId: rootBatchId,
            mediaKey: { in: keys },
            status: QuestionImportMediaStatus.ELIGIBLE,
            asset: { is: { status: 'READY' } },
          },
          include: { asset: { select: { storageKey: true, mimeType: true } } },
        })
      : [];
    const questionPages = new Set<number>(
      (input.questions ?? []).flatMap(
        (question: any) => question.pageNumbers ?? [],
      ),
    );
    const selected = rows
      .filter((row) => row.asset?.storageKey)
      .sort((a, b) =>
        proximityByKey.get(a.mediaKey)! - proximityByKey.get(b.mediaKey)! ||
        (questionPages.has(a.pageNumber) === questionPages.has(b.pageNumber)
          ? a.mediaKey.localeCompare(b.mediaKey)
          : questionPages.has(a.pageNumber)
            ? -1
            : 1),
      )
      .slice(0, 12);
    const sentKeys = new Set(selected.map((row) => row.mediaKey));
    input.media = (input.media ?? []).filter((row: any) =>
      sentKeys.has(row.mediaKey),
    );
    input.questions = (input.questions ?? []).map((question: any) => ({
      ...question,
      media: (question.media ?? []).filter((row: any) =>
        sentKeys.has(row.mediaKey),
      ),
    }));
    const crops = await Promise.all(
      selected.map(async (row) => ({
        mediaKey: row.mediaKey,
        mimeType: row.asset.mimeType,
        data: await this.storage.download(row.asset.storageKey),
      })),
    );
    return this.client.extractQuestionsV4(input, crops);
  }
  private async createItem(
    batch: any,
    chunk: any,
    sequence: number,
    c: ImportedCandidate,
    source: any,
    v3 = false,
    v4 = false,
  ) {
    if (v4)
      return this.createV4Item(
        batch,
        chunk,
        sequence,
        c as unknown as ImportedCandidateV4,
        source,
      );
    if (v3)
      return this.createV3Item(
        batch,
        chunk,
        sequence,
        c as unknown as ImportedCandidateV3,
        source,
      );
    const selected = new Set(c.answer?.selectedOptionIndexes ?? []);
    const options =
      c.options?.map((option, index) => ({
        ...option,
        isCorrect: selected.has(index),
      })) ?? [];
    const explanation = c.explanation;
    const valid =
      c.body?.trim() &&
      Object.values(explanation ?? {}).every(
        (value) => typeof value === 'string' && value.trim(),
      ) &&
      options.length >= 2 &&
      new Set(options.map((option) => option.body.trim())).size ===
        options.length &&
      options.some((o) => o.isCorrect) &&
      (c.type !== 'SINGLE_CHOICE' ||
        options.filter((o) => o.isCorrect).length === 1) &&
      (c.type !== 'MULTIPLE_CHOICE' ||
        options.filter((o) => o.isCorrect).length >= 2);
    const confidence = c.answer?.confidence;
    const sourceWarnings = c.warnings ?? [];
    const corruptionWarning =
      /ambiguous|uncertain|garbl|corrupt|illegible|مشوش|تشوش|غير\s*واضح|محرّف|محرف|مقطوع|غير\s*مقروء/i;
    const reviewRequired =
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      confidence < 0.9 ||
      c.answer?.origin !== 'EXPLICIT' ||
      sourceWarnings.some((warning) => corruptionWarning.test(warning));
    const plainExplanation = explanation
      ? [
          explanation.keywords,
          explanation.eliminationStrategy,
          explanation.whyCorrect,
          explanation.generalRule,
          explanation.whatIf,
          explanation.commonMistakes,
        ].join('\n\n')
      : '';
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
            sourceLocator: {
              firstBlock: source.firstBlock,
              lastBlock: source.lastBlock,
              page: source.page,
            },
            sourceNumber: source.sourceNumber,
            globalOrder:
              (batch.childSequence ?? 0) * 1_000_000 +
              chunk.sequence * 1_000 +
              sequence,
            section: source.section,
            detectedType: c.type,
            answerOrigin:
              c.answer?.origin === 'EXPLICIT'
                ? QuestionAnswerProvenance.SOURCE_MARKED
                : QuestionAnswerProvenance.AI_INFERRED,
          },
        });
        if (!valid)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.INVALID,
              errorDetail: 'Candidate does not satisfy question domain rules',
            },
          });
        if (reviewRequired)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.REVIEW_REQUIRED,
              errorDetail:
                'AI answer requires admin review before a draft can be created',
            },
          });
        const q = await this.questions.createImportedDraftWithClient(
          {
            id: batch.createdById,
            role: Role.ADMIN,
            sessionId: 'ai-import-worker',
          },
          {
            bankId: batch.bankId,
            sourceId: batch.sourceId,
            courseId: batch.courseId,
            placements: batch.placements,
            body: c.body,
            explanation: plainExplanation,
            type: c.type,
            options,
            contextIds: source.contextIds,
            aiExplanation: explanation,
            aiAnswerOrigin: c.answer.origin,
            confidence: c.answer.confidence,
            warnings: c.warnings,
            model: batch.model,
          },
          tx,
        );
        return tx.questionImportItem.update({
          where: { id: item.id },
          data: { status: QuestionImportItemStatus.CREATED, questionId: q.id },
        });
      });
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
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
  private async createV3Item(
    batch: any,
    chunk: any,
    sequence: number,
    c: ImportedCandidateV3,
    source: any,
  ) {
    const type = c?.type;
    const choice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    const written = type === 'SHORT_ANSWER' || type === 'FILL_IN_THE_BLANK';
    const options = choice
      ? ((c as any).options?.map((option: any, index: number) => ({
          body: option.body?.trim(),
          isCorrect: new Set((c as any).selectedOptionIndexes ?? []).has(index),
        })) ?? [])
      : [];
    const acceptedAnswers = written
      ? ((c as any).acceptedAnswers ?? []).map((answer: any) =>
          typeof answer === 'string' ? answer.trim() : '',
        )
      : [];
    const gradingRubric =
      type === 'LONG_ANSWER' ? (c as any).gradingRubric?.trim() : undefined;
    const confidence = c?.confidence;
    const warnings = c?.warnings ?? [];
    const citations = [...new Set(c?.citedEvidenceKeys ?? [])];
    const allowedEvidence = new Set(
      (source.answerEvidence ?? []).map(
        (evidence: any) => evidence.evidenceKey,
      ),
    );
    const citationValid = citations.every((key) => allowedEvidence.has(key));
    const corruptionWarning =
      /ambiguous|uncertain|incomplete|missing|absent|no\s+answer|garbl|corrupt|illegible|مشوش|تشوش|غير\s*واضح|محرّف|محرف|مقطوع|غير\s*مقروء/i;
    const validType = choice || written || type === 'LONG_ANSWER';
    const structuralValid =
      validType &&
      typeof c?.body === 'string' &&
      Boolean(c.body.trim()) &&
      typeof c?.explanation === 'string' &&
      Boolean(c.explanation.trim()) &&
      ['SOURCE_MARKED', 'AI_INFERRED'].includes(c?.answerOrigin);
    const choiceComplete =
      choice &&
      options.length >= 2 &&
      options.every((option: any) => option.body) &&
      new Set(options.map((option: any) => option.body)).size ===
        options.length &&
      options.some((option: any) => option.isCorrect) &&
      (type !== 'SINGLE_CHOICE' ||
        options.filter((option: any) => option.isCorrect).length === 1) &&
      (type !== 'MULTIPLE_CHOICE' ||
        options.filter((option: any) => option.isCorrect).length >= 2);
    const writtenComplete =
      written &&
      acceptedAnswers.length > 0 &&
      acceptedAnswers.every(Boolean) &&
      new Set(acceptedAnswers).size === acceptedAnswers.length;
    const longComplete = type === 'LONG_ANSWER' && Boolean(gradingRubric);
    const completeAnswer = choice
      ? choiceComplete
      : written
        ? writtenComplete
        : longComplete;
    const reviewRequired =
      Boolean(source.contextUnresolved) ||
      !completeAnswer ||
      !citationValid ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      confidence < 0.9 ||
      c.answerOrigin !== 'SOURCE_MARKED' ||
      !citations.length ||
      warnings.some((warning) => corruptionWarning.test(warning));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.questionImportItem.create({
          data: {
            batchId: batch.id,
            chunkId: chunk.id,
            sequence,
            status: QuestionImportItemStatus.PROCESSING,
            rawOutput: c as any,
            normalizedOutput: {
              ...c,
              options,
              acceptedAnswers,
              gradingRubric,
            } as any,
            confidence,
            warnings: warnings as any,
            citedEvidenceKeys: citations as any,
            sourceLocator: {
              firstBlock: source.firstBlock,
              lastBlock: source.lastBlock,
              page: source.page,
            },
            sourceNumber: source.sourceNumber,
            globalOrder:
              (batch.childSequence ?? 0) * 1_000_000 +
              chunk.sequence * 1_000 +
              sequence,
            section: source.section,
            detectedType: type,
            answerOrigin: c.answerOrigin as QuestionAnswerProvenance,
          },
        });
        if (!structuralValid)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.INVALID,
              errorDetail: 'Candidate does not satisfy typed question rules',
            },
          });
        if (reviewRequired)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.REVIEW_REQUIRED,
              errorDetail: source.contextUnresolved
                ? `CONTEXT_UNRESOLVED: ${(source.contextDiagnostics ?? []).join('; ')}`
                : !citationValid || !citations.length
                  ? 'Answer has no relevant retained source evidence'
                  : 'AI answer requires admin review before a draft can be created',
            },
          });
        const q = await this.questions.createImportedDraftWithClient(
          {
            id: batch.createdById,
            role: Role.ADMIN,
            sessionId: 'ai-import-worker',
          },
          {
            bankId: batch.bankId,
            sourceId: batch.sourceId,
            courseId: batch.courseId,
            placements: batch.placements,
            body: c.body,
            explanation: c.explanation,
            type,
            options,
            acceptedAnswers,
            gradingRubric,
            contextIds: source.contextIds,
            answerOrigin: QuestionAnswerProvenance.SOURCE_MARKED,
          },
          tx,
        );
        return tx.questionImportItem.update({
          where: { id: item.id },
          data: { status: QuestionImportItemStatus.CREATED, questionId: q.id },
        });
      });
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return;
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
  private blockInRange(key: string, first: string, last: string) {
    const value = Number(key.slice(1));
    return (
      /^B\d+$/.test(key) &&
      value >= Number(first.slice(1)) &&
      value <= Number(last.slice(1))
    );
  }
  /**
   * Models sometimes compact a contiguous citation into `B00010-B00014`.
   * Treat that as a citation for the bounded block range while retaining the
   * same ownership check as individual source block keys.
   */
  private sourceCitationInRange(key: string, first: string, last: string) {
    if (this.blockInRange(key, first, last)) return true;
    const match = /^B(\d+)-B(\d+)$/.exec(key);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2]);
    return (
      start <= end &&
      start >= Number(first.slice(1)) &&
      end <= Number(last.slice(1))
    );
  }
  private async createV4Item(
    batch: any,
    chunk: any,
    sequence: number,
    c: ImportedCandidateV4,
    source: any,
  ) {
    const isV5 = batch.schemaVersion === 'question-import-v5';
    const type = c?.type;
    const choice = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE';
    const written = type === 'SHORT_ANSWER' || type === 'FILL_IN_THE_BLANK';
    const selected = new Set(c?.selectedOptionIndexes ?? []);
    const options = choice
      ? (c.options ?? []).map((option, index) => ({
          body: typeof option?.body === 'string' ? option.body.trim() : '',
          isCorrect: selected.has(index),
        }))
      : [];
    const acceptedAnswers = written
      ? (c.acceptedAnswers ?? []).map((answer) => answer.trim())
      : [];
    const gradingRubric =
      type === 'LONG_ANSWER' ? c.gradingRubric?.trim() : undefined;
    const citations = [...new Set(c.citedEvidenceKeys ?? [])];
    const sourceCitations = [...new Set(c.citedSourceBlockKeys ?? [])];
    const allowedEvidence = new Set(
      (source.answerEvidence ?? []).map((item: any) => item.evidenceKey),
    );
    // Some model responses include the supplied context key alongside the
    // page-block citations. Context keys are already scoped by segmentation,
    // so retain them as valid citations without treating arbitrary IDs as
    // source blocks.
    const sourceCitationValid =
      sourceCitations.length > 0 &&
      sourceCitations.every(
        (key) =>
          this.sourceCitationInRange(
            key,
            source.firstBlock,
            source.lastBlock,
          ) || (source.contextIds ?? []).includes(key),
      );
    const evidenceValid = citations.every((key) => allowedEvidence.has(key));
    const assignments = c.mediaAssignments ?? [];
    const offeredMedia = new Set(
      (source.media ?? []).map((item: any) => item.mediaKey),
    );
    const contextKeys = new Set(source.contextIds ?? []);
    const validAssignment = (assignment: any) => {
      if (
        !offeredMedia.has(assignment.mediaKey) ||
        !['QUESTION', 'OPTION', 'CONTEXT'].includes(assignment.owner) ||
        !Number.isFinite(assignment.confidence) ||
        assignment.confidence < 0 ||
        assignment.confidence > 1 ||
        typeof assignment.reason !== 'string' ||
        !assignment.reason.trim()
      )
        return false;
      if (
        assignment.owner === 'QUESTION' &&
        assignment.ownerReference !== 'QUESTION'
      )
        return false;
      if (assignment.owner === 'OPTION') {
        const match = /^OPTION:(\d+)$/.exec(assignment.ownerReference);
        if (!match || Number(match[1]) >= options.length) return false;
      }
      if (
        assignment.owner === 'CONTEXT' &&
        !contextKeys.has(assignment.ownerReference)
      )
        return false;
      return (
        assignment.placementAnchor === null ||
        assignment.placementAnchor === 'START' ||
        assignment.placementAnchor === 'END' ||
        (typeof assignment.placementAnchor === 'string' &&
          assignment.placementAnchor.startsWith('AFTER:') &&
          this.sourceCitationInRange(
            assignment.placementAnchor.slice(6),
            source.firstBlock,
            source.lastBlock,
          ))
      );
    };
    const assignmentValid =
      assignments.every(validAssignment) &&
      new Set(
        assignments.map(
          (item) => `${item.mediaKey}:${item.owner}:${item.ownerReference}`,
        ),
      ).size === assignments.length;
    const hasOptionVisual = (index: number) =>
      assignments.some(
        (item) =>
          item.owner === 'OPTION' && item.ownerReference === `OPTION:${index}`,
      );
    const choiceComplete =
      choice &&
      options.length >= 2 &&
      options.every((option, index) => option.body || hasOptionVisual(index)) &&
      options.some((option) => option.isCorrect) &&
      (type !== 'SINGLE_CHOICE' ||
        options.filter((option) => option.isCorrect).length === 1) &&
      (type !== 'MULTIPLE_CHOICE' ||
        options.filter((option) => option.isCorrect).length >= 2);
    const answerComplete = choice
      ? choiceComplete
      : written
        ? acceptedAnswers.length > 0 && acceptedAnswers.every(Boolean)
        : type === 'LONG_ANSWER' && Boolean(gradingRubric);
    const structuralValid =
      Boolean(
        [
          'SINGLE_CHOICE',
          'MULTIPLE_CHOICE',
          'SHORT_ANSWER',
          'FILL_IN_THE_BLANK',
          'LONG_ANSWER',
        ].includes(type),
      ) &&
      Boolean(c.body?.trim()) &&
      Boolean(c.explanation?.trim()) &&
      ['SOURCE_MARKED', 'AI_INFERRED'].includes(c.answerOrigin) &&
      assignmentValid &&
      sourceCitationValid;
    const warnings = c.warnings ?? [];
    const requirementSpecs = isV5
      ? this.visualLinker.requirements(c, source)
      : [];
    const visualRequired = requirementSpecs.some(
      (item) => item.kind !== 'NONE',
    );
    const reviewRequired =
      Boolean(source.contextUnresolved) ||
      visualRequired ||
      !answerComplete ||
      !evidenceValid ||
      !citations.length ||
      c.answerOrigin !== 'SOURCE_MARKED' ||
      !Number.isFinite(c.confidence) ||
      c.confidence < 0.9 ||
      warnings.length > 0 ||
      assignments.some((item) => item.confidence < 0.9);
    try {
      const rootBatchId = batch.parentId ?? batch.id;
      const mediaRows: any[] = assignments.length
        ? await this.prisma.questionImportMedia.findMany({
            where: {
              batchId: rootBatchId,
              mediaKey: { in: assignments.map((item) => item.mediaKey) },
              status: QuestionImportMediaStatus.ELIGIBLE,
              asset: { is: { status: 'READY' } },
            },
            include: { asset: true },
          })
        : [];
      if (
        mediaRows.length !==
        new Set(assignments.map((item) => item.mediaKey)).size
      )
        throw new Error(
          'Candidate references media that is not approved for attachment',
        );
      const mediaByKey = new Map(
        mediaRows.map((item) => [item.mediaKey, item]),
      );
      const rankedMedia: any[] = isV5
        ? await this.prisma.questionImportMedia.findMany({
            where: {
              batchId: rootBatchId,
              status: QuestionImportMediaStatus.ELIGIBLE,
              asset: { is: { status: 'READY' } },
            },
          })
        : mediaRows;
      return await this.prisma.$transaction(async (tx: any) => {
        const item = await tx.questionImportItem.create({
          data: {
            batchId: batch.id,
            chunkId: chunk.id,
            sequence,
            status: QuestionImportItemStatus.PROCESSING,
            rawOutput: c as any,
            normalizedOutput: {
              ...c,
              options,
              acceptedAnswers,
              gradingRubric,
            } as any,
            confidence: c.confidence,
            warnings: warnings as any,
            citedEvidenceKeys: citations as any,
            sourceLocator: {
              firstBlock: source.firstBlock,
              lastBlock: source.lastBlock,
              page: source.page,
            },
            sourceNumber: source.sourceNumber,
            globalOrder:
              (batch.childSequence ?? 0) * 1_000_000 +
              chunk.sequence * 1_000 +
              sequence,
            section: source.section,
            detectedType: type,
            answerOrigin: c.answerOrigin as QuestionAnswerProvenance,
            visualState: visualRequired
              ? QuestionImportVisualResolutionState.PENDING
              : QuestionImportVisualResolutionState.NOT_REQUIRED,
            answerContentValid: !visualRequired,
          },
        });
        const exclusiveMediaIds = [
          ...new Set(
            assignments
              .filter(
                (assignment) =>
                  assignment.owner === 'QUESTION' || assignment.owner === 'OPTION',
              )
              .map((assignment) => mediaByKey.get(assignment.mediaKey).id),
          ),
        ];
        // Serialize competing claims for the same crop. The nullable unique
        // key is the final guard; these advisory locks let the losing proposal
        // remain reviewable instead of being dropped on a P2002 race.
        for (const mediaId of [...exclusiveMediaIds].sort())
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${rootBatchId}:${mediaId}`}))`,
          );
        const ownershipConflicts: any[] = exclusiveMediaIds.length
          ? await tx.questionImportMediaAssignment.findMany({
              where: {
                mediaId: { in: exclusiveMediaIds },
                importItemId: { not: item.id },
                owner: {
                  in: [
                    QuestionImportMediaAssignmentOwner.QUESTION,
                    QuestionImportMediaAssignmentOwner.OPTION,
                  ],
                },
                status: { not: QuestionImportMediaAssignmentStatus.REJECTED },
                importItem: {
                  OR: [
                    { batchId: rootBatchId },
                    { batch: { parentId: rootBatchId } },
                  ],
                },
              },
              select: { mediaId: true },
            })
          : [];
        const conflictingMediaIds = new Set(
          ownershipConflicts.map((conflict) => conflict.mediaId),
        );
        const assignmentRows = await Promise.all(
          assignments.map((assignment) =>
            tx.questionImportMediaAssignment.create({
              data: {
                importItemId: item.id,
                mediaId: mediaByKey.get(assignment.mediaKey).id,
                assignmentKey: `${assignment.mediaKey}:${assignment.owner}:${assignment.ownerReference}`,
                exclusiveOwnershipKey:
                  assignment.owner === 'QUESTION' || assignment.owner === 'OPTION'
                    ? conflictingMediaIds.has(
                        mediaByKey.get(assignment.mediaKey).id,
                      )
                      ? null
                      : `${rootBatchId}:${mediaByKey.get(assignment.mediaKey).id}`
                    : null,
                owner: assignment.owner as QuestionImportMediaAssignmentOwner,
                ownerReference: assignment.ownerReference,
                placementAnchor: assignment.placementAnchor,
                confidence: assignment.confidence,
                reason: assignment.reason.trim(),
                scoreComponents: {
                  modelConfidence: assignment.confidence,
                  samePage:
                    mediaByKey.get(assignment.mediaKey).pageNumber ===
                    source.page,
                  ownershipConflict: conflictingMediaIds.has(
                    mediaByKey.get(assignment.mediaKey).id,
                  ),
                },
                evidenceVersion: isV5
                  ? this.visualLinker.evidenceVersion([])
                  : null,
                status: isV5
                  ? QuestionImportMediaAssignmentStatus.PROPOSED
                  : reviewRequired
                    ? QuestionImportMediaAssignmentStatus.PROPOSED
                    : QuestionImportMediaAssignmentStatus.APPROVED,
              },
            }),
          ),
        );
        if (isV5) {
          const linkedAssignments = assignments.map((assignment) => ({
            ...assignment,
            status: QuestionImportMediaAssignmentStatus.PROPOSED,
            media: mediaByKey.get(assignment.mediaKey),
            conflicting:
              (assignment.owner === 'QUESTION' || assignment.owner === 'OPTION') &&
              conflictingMediaIds.has(mediaByKey.get(assignment.mediaKey).id),
          }));
          const outcomes = requirementSpecs.map((requirement) => ({
            requirement,
            outcome: this.visualLinker.resolve(
              requirement,
              linkedAssignments,
              rankedMedia,
            ),
          }));
          await Promise.all(
            outcomes.map(({ requirement, outcome }) =>
              tx.questionImportVisualRequirement.create({
                data: {
                  importItemId: item.id,
                  ...requirement,
                  sourceEnvelope: source.envelope ?? null,
                  optionIndexes: requirement.optionIndexes,
                  resolutionState: outcome.state,
                  unresolvedReason: outcome.reason,
                  candidateRankings: outcome.rankings,
                },
              }),
            ),
          );
          const visualState = outcomes.some(
            ({ outcome }) =>
              outcome.state !==
              QuestionImportVisualResolutionState.NOT_REQUIRED,
          )
            ? outcomes.find(
                ({ outcome }) =>
                  outcome.state !==
                  QuestionImportVisualResolutionState.NOT_REQUIRED,
              )!.outcome.state
            : QuestionImportVisualResolutionState.NOT_REQUIRED;
          await tx.questionImportItem.update({
            where: { id: item.id },
            data: { visualState, answerContentValid: !visualRequired },
          });
        }
        if (!structuralValid)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.INVALID,
              errorDetail:
                'Candidate has invalid visual ownership or source citations',
            },
          });
        if (reviewRequired)
          return tx.questionImportItem.update({
            where: { id: item.id },
            data: {
              status: QuestionImportItemStatus.REVIEW_REQUIRED,
              errorDetail: source.contextUnresolved
                ? `CONTEXT_UNRESOLVED: ${(source.contextDiagnostics ?? []).join('; ')}`
                : 'Visual ownership or answer evidence requires admin review',
            },
          });
        const questionBlocks = this.anchoredContentBlocks(
          c.body.trim(),
          assignments,
          mediaByKey,
          (assignment) => assignment.owner === 'QUESTION',
        );
        const visualOptions = options.map((option, index) => ({
          ...option,
          contentBlocks: this.anchoredContentBlocks(
            option.body,
            assignments,
            mediaByKey,
            (assignment) =>
              assignment.owner === 'OPTION' &&
              assignment.ownerReference === `OPTION:${index}`,
          ),
        }));
        const q = await this.questions.createImportedDraftWithClient(
          {
            id: batch.createdById,
            role: Role.ADMIN,
            sessionId: 'ai-import-worker',
          },
          {
            bankId: batch.bankId,
            sourceId: batch.sourceId,
            courseId: batch.courseId,
            placements: batch.placements,
            body: c.body,
            contentBlocks: questionBlocks,
            explanation: c.explanation,
            type,
            options: visualOptions,
            acceptedAnswers,
            gradingRubric,
            contextIds: source.contextDbIds ?? [],
            answerOrigin: QuestionAnswerProvenance.SOURCE_MARKED,
          },
          tx,
        );
        for (const assignment of assignments.filter(
          (value) => value.owner === 'CONTEXT',
        )) {
          const contextIndex = (source.contextIds ?? []).indexOf(
            assignment.ownerReference,
          );
          const contextId = source.contextDbIds?.[contextIndex];
          if (!contextId) continue;
          const existing = await tx.questionContextContentBlock.findFirst({
            where: {
              questionContextId: contextId,
              assetId: mediaByKey.get(assignment.mediaKey).assetId,
            },
          });
          const block =
            existing ??
            (await tx.questionContextContentBlock.create({
              data: {
                questionContextId: contextId,
                type: QuestionContentBlockType.IMAGE,
                assetId: mediaByKey.get(assignment.mediaKey).assetId,
                altText: assignment.reason.trim(),
                sortOrder:
                  (await tx.questionContextContentBlock.count({
                    where: { questionContextId: contextId },
                  })) + 1,
              },
            }));
          const stored = assignmentRows.find(
            (row: any) =>
              row.assignmentKey ===
              `${assignment.mediaKey}:${assignment.owner}:${assignment.ownerReference}`,
          );
          await tx.questionImportMediaAssignment.update({
            where: { id: stored.id },
            data: { finalContentBlockId: block.id },
          });
        }
        for (const assignment of assignments.filter(
          (value) => value.owner !== 'CONTEXT',
        )) {
          const stored = assignmentRows.find(
            (row: any) =>
              row.assignmentKey ===
              `${assignment.mediaKey}:${assignment.owner}:${assignment.ownerReference}`,
          );
          const block =
            assignment.owner === 'QUESTION'
              ? q.contentBlocks.find(
                  (value: any) =>
                    value.assetId ===
                    mediaByKey.get(assignment.mediaKey).assetId,
                )
              : q.options[
                  Number(assignment.ownerReference.slice(7))
                ]?.contentBlocks.find(
                  (value: any) =>
                    value.assetId ===
                    mediaByKey.get(assignment.mediaKey).assetId,
                );
          if (block)
            await tx.questionImportMediaAssignment.update({
              where: { id: stored.id },
              data: { finalContentBlockId: block.id },
            });
        }
        return tx.questionImportItem.update({
          where: { id: item.id },
          data: { status: QuestionImportItemStatus.CREATED, questionId: q.id },
        });
      });
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return;
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
          errorDetail: error.message.slice(0, 2000),
        },
      });
    }
  }
}
