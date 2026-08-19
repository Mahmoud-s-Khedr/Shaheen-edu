import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AssetKind, AssetStatus, QuestionAnswerProvenance, QuestionImportInputType, QuestionImportItemStatus, QuestionImportMediaStatus, QuestionImportStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { QuestionImportQueue } from './question-import.queue';
import type { AcceptQuestionImportItemDto, CreateQuestionImportDto, QueryQuestionImportDto, RejectQuestionImportItemDto, UpdateQuestionImportSourceTextDto } from './dto/question-import.dto';
import { QuestionBanksService } from '../question-banks/question-banks.service';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { AssetsService } from '../assets/assets.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import { PdfPageRangeService } from './pdf-page-range.service';
import { QuestionImportMediaService } from './question-import-media.service';

@Injectable()
export class QuestionImportService {
  private readonly model: string;
  private readonly ai: AppConfig['ai'];
  constructor(private readonly prisma: PrismaService, private readonly queue: QuestionImportQueue, private readonly audit: AuditService, private readonly questions: QuestionBanksService, private readonly assets: AssetsService, private readonly storage: BunnyStorageProvider, private readonly pdfRanges: PdfPageRangeService, private readonly mediaExtraction: QuestionImportMediaService, config: ConfigService<AppConfig, true>) { this.ai = config.get('ai', { infer: true }); this.model = this.ai.questionImportModel; }
  private admin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private assertConfigured() { if (!this.ai.openRouterApiKey || !this.ai.questionImportModel) throw new ServiceUnavailableException('AI question import is not configured'); }
  async create(actor: RequestUser, dto: CreateQuestionImportDto) {
    this.admin(actor);
    this.assertConfigured();
    if (Boolean(dto.rawText?.trim()) === Boolean(dto.sourceAssetId)) throw new BadRequestException('Provide exactly one of rawText or sourceAssetId');
    await this.questions.validateImportTarget(actor, dto);
    let asset: any = null;
    if (dto.sourceAssetId) { asset = await this.prisma.asset.findUnique({ where: { id: dto.sourceAssetId } }); if (!asset || asset.status !== AssetStatus.READY || ![AssetKind.PDF, AssetKind.DOCUMENT, AssetKind.DOWNLOADABLE_FILE].includes(asset.kind) || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(asset.mimeType)) throw new BadRequestException('Source asset must be a ready PDF, DOCX, or TXT asset'); }
    if (asset?.mimeType === 'application/pdf' && !this.ai.pdfTranscriptionModel) throw new ServiceUnavailableException('PDF transcription is not configured');
    const batch = await this.prisma.questionImportBatch.create({ data: { inputType: asset ? QuestionImportInputType.ASSET : QuestionImportInputType.RAW_TEXT, rawText: dto.rawText?.trim() ?? null, sourceAssetId: asset?.id, bankId: dto.bankId, sourceId: dto.sourceId, courseId: dto.courseId, placements: dto.placements as any, model: this.model, schemaVersion: 'question-import-v3', createdById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_CREATED', targetType: 'QuestionImportBatch', targetId: batch.id });
    await this.queue.enqueue(batch.id);
    return this.summary(batch);
  }
  async list(actor: RequestUser, query: QueryQuestionImportDto) { this.admin(actor); const where: any = { parentId: null, ...(query.status ? { status: query.status } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportBatch.count({ where })]); return { data: data.map((batch) => this.summary(batch)), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async get(actor: RequestUser, id: string) { this.admin(actor); return this.detail(await this.batch(id)); }
  async sourceText(actor: RequestUser, id: string) { this.admin(actor); const batch = await this.batch(id); return { id, normalizedText: batch.normalizedText, extractionMetadata: batch.extractionMetadata, errorSummary: batch.errorSummary, segmentationWarnings: batch.segmentationWarnings, pages: batch.pages.map((page: any) => ({ pageNumber: page.pageNumber, status: page.status, canonicalText: page.canonicalText, confidence: page.confidence, uncertainSpans: page.uncertainSpans, warnings: page.warnings })) }; }
  async updateSourceText(actor: RequestUser, id: string, dto: UpdateQuestionImportSourceTextDto) { this.admin(actor); this.assertConfigured(); const batch = await this.batch(id); if (batch.status !== QuestionImportStatus.AWAITING_REVIEW || batch._count.items) throw new ConflictException('Source text can be changed only for a review-required import with no created items'); const normalizedText = dto.normalizedText.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (normalizedText.length < 20) throw new BadRequestException('Source text is too short'); await this.prisma.$transaction([this.prisma.questionImportSkippedRange.deleteMany({ where: { batchId: id } }), this.prisma.questionImportAnswerEvidence.deleteMany({ where: { batchId: id } }), this.prisma.questionImportSourceBlock.deleteMany({ where: { batchId: id } }), this.prisma.questionImportChunk.deleteMany({ where: { batchId: id } }), this.prisma.questionImportBatch.update({ where: { id }, data: { normalizedText, sourceTextEditedAt: new Date(), segmentationRawOutput: Prisma.JsonNull, segmentationUsage: Prisma.JsonNull, segmentationWarnings: Prisma.JsonNull, errorSummary: null, status: QuestionImportStatus.QUEUED, totalChunks: 0, completedChunks: 0 } })]); await this.queue.enqueue(id); await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_SOURCE_TEXT_UPDATED', targetType: 'QuestionImportBatch', targetId: id }); return this.get(actor, id); }
  async items(actor: RequestUser, id: string, query: QueryQuestionImportDto) { this.admin(actor); const batch = await this.batch(id); const batchIds = batch.children.length ? batch.children.map((child: any) => child.id) : [id]; const where: any = { batchId: { in: batchIds }, ...(query.status ? { status: query.status } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportItem.findMany({ where, orderBy: [{ batch: { childSequence: 'asc' } }, { chunk: { sequence: 'asc' } }, { sequence: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportItem.count({ where })]); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
  async media(actor: RequestUser, id: string) {
    this.admin(actor);
    const batch = await this.rootPdfImport(id);
    const data: any[] = await this.prisma.questionImportMedia.findMany({ where: { batchId: batch.id }, include: { asset: true, detections: { orderBy: { createdAt: 'asc' } } }, orderBy: [{ pageNumber: 'asc' }, { mediaKey: 'asc' }] });
    return {
      importId: batch.id,
      sourcePdf: this.assets.protectedAccess(batch.sourceAsset),
      data: data.map((media) => this.mediaSummary(media)),
    };
  }
  async createMedia(actor: RequestUser, id: string, dto: import('./dto/question-import.dto').CreateQuestionImportMediaDto) {
    this.admin(actor);
    const batch = await this.rootPdfImport(id);
    const pdf = await this.storage.download(batch.sourceAsset.storageKey!);
    const image = await this.pdfRanges.renderPage(pdf, dto.pageNumber, 350);
    const media = await this.mediaExtraction.createManualRegion(batch, dto.pageNumber, image, { type: dto.type, bounds: dto.bounds, confidence: 1, description: dto.description.trim(), warnings: [] }, actor.id);
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_MEDIA_CREATED', targetType: 'QuestionImportMedia', targetId: media.id, metadata: { importId: batch.id, mediaKey: media.mediaKey, pageNumber: dto.pageNumber } });
    return this.mediaSummary(media);
  }
  async updateMedia(actor: RequestUser, id: string, mediaKey: string, dto: import('./dto/question-import.dto').UpdateQuestionImportMediaDto) {
    this.admin(actor);
    const batch = await this.rootPdfImport(id);
    const media: any = await this.prisma.questionImportMedia.findUnique({ where: { batchId_mediaKey: { batchId: batch.id, mediaKey } }, include: { asset: true, detections: true } });
    if (!media) throw new NotFoundException('Question import media not found');
    if (dto.status === QuestionImportMediaStatus.FAILED) throw new BadRequestException('FAILED is reserved for materialization errors');
    let updated: any;
    if (dto.bounds) {
      const pdf = await this.storage.download(batch.sourceAsset.storageKey!);
      const image = await this.pdfRanges.renderPage(pdf, media.pageNumber, 350);
      updated = await this.mediaExtraction.replaceCanonicalRegion(media, batch, image, { type: dto.type ?? media.type, bounds: dto.bounds, confidence: 1, description: dto.description?.trim() || media.description, warnings: [] }, actor.id);
      if (dto.status) updated = await this.prisma.questionImportMedia.update({ where: { id: media.id }, data: { status: dto.status, reviewedAt: new Date(), reviewedById: actor.id, reviewNote: dto.note?.trim() ?? null }, include: { asset: true, detections: { orderBy: { createdAt: 'asc' } } } });
    } else {
      updated = await this.prisma.$transaction(async (tx: any) => {
        if (dto.type || dto.description) {
          await tx.questionImportMediaDetection.updateMany({ where: { mediaId: media.id }, data: { accepted: false } });
          await tx.questionImportMediaDetection.create({ data: { mediaId: media.id, source: 'MANUAL', normalizedBounds: media.normalizedBounds, type: dto.type ?? media.type, confidence: null, description: dto.description?.trim() ?? media.description, warnings: [], validationFlags: media.validationFlags, accepted: true, createdById: actor.id } });
        }
        return tx.questionImportMedia.update({ where: { id: media.id }, data: { ...(dto.status ? { status: dto.status, reviewedAt: new Date(), reviewedById: actor.id } : {}), ...(dto.type ? { type: dto.type } : {}), ...(dto.description ? { description: dto.description.trim() } : {}), ...(dto.note !== undefined ? { reviewNote: dto.note.trim() } : {}) }, include: { asset: true, detections: { orderBy: { createdAt: 'asc' } } } });
      });
    }
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_MEDIA_REVIEWED', targetType: 'QuestionImportMedia', targetId: media.id, metadata: { importId: batch.id, mediaKey, status: updated.status } });
    return this.mediaSummary(updated);
  }
  async retryMedia(actor: RequestUser, id: string, mediaKey: string) {
    this.admin(actor);
    const batch = await this.rootPdfImport(id);
    const media: any = await this.prisma.questionImportMedia.findUnique({ where: { batchId_mediaKey: { batchId: batch.id, mediaKey } } });
    if (!media) throw new NotFoundException('Question import media not found');
    if (media.status !== QuestionImportMediaStatus.FAILED) throw new ConflictException('Only failed media can be retried');
    const pdf = await this.storage.download(batch.sourceAsset.storageKey!);
    const image = await this.pdfRanges.renderPage(pdf, media.pageNumber, 350);
    const updated = await this.mediaExtraction.replaceCanonicalRegion(media, batch, image, { type: media.type, bounds: media.normalizedBounds, confidence: media.confidence, description: media.description, warnings: media.warnings ?? [] }, actor.id);
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_MEDIA_RETRIED', targetType: 'QuestionImportMedia', targetId: media.id, metadata: { importId: batch.id, mediaKey } });
    return this.mediaSummary(updated);
  }
  async acceptItem(actor: RequestUser, id: string, itemId: string, dto: AcceptQuestionImportItemDto) {
    this.admin(actor);
    const created = await this.prisma.$transaction(async (tx: any) => {
      const item = await tx.questionImportItem.findFirst({ where: { id: itemId, OR: [{ batchId: id }, { batch: { parentId: id } }] }, include: { batch: { include: { answerEvidence: true } }, chunk: true } });
      if (!item) throw new NotFoundException('Question import item not found');
      if (item.status !== QuestionImportItemStatus.REVIEW_REQUIRED || item.questionId) throw new ConflictException('Only unresolved review candidates can be accepted');
      const source = this.itemSource(item);
      const normalized = this.normalizeReviewCandidate(dto.candidate, source, item.batch.answerEvidence);
      const question = await this.questions.createImportedDraftWithClient(
        { id: actor.id, role: actor.role, sessionId: actor.sessionId },
        { bankId: item.batch.bankId, sourceId: item.batch.sourceId, courseId: item.batch.courseId, placements: item.batch.placements, body: normalized.body, explanation: normalized.explanation, type: normalized.type, options: normalized.options, acceptedAnswers: normalized.acceptedAnswers, gradingRubric: normalized.gradingRubric, contextIds: source.contextIds ?? [], answerOrigin: QuestionAnswerProvenance.HUMAN_REVIEWED },
        tx,
      );
      const updated = await tx.questionImportItem.update({ where: { id: item.id }, data: { status: QuestionImportItemStatus.CREATED, questionId: question.id, answerOrigin: QuestionAnswerProvenance.HUMAN_REVIEWED, citedEvidenceKeys: normalized.citedEvidenceKeys, reviewerCandidate: normalized as any, reviewedAt: new Date(), reviewedById: actor.id, reviewNote: dto.note?.trim() ?? null, errorDetail: null } });
      await this.refreshReviewSummary(tx, item.batchId, item.batch.parentId);
      return updated;
    });
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_ITEM_ACCEPTED', targetType: 'QuestionImportItem', targetId: itemId, metadata: { importId: id, questionId: created.questionId } });
    return created;
  }
  async rejectItem(actor: RequestUser, id: string, itemId: string, dto: RejectQuestionImportItemDto) {
    this.admin(actor);
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const item = await tx.questionImportItem.findFirst({ where: { id: itemId, OR: [{ batchId: id }, { batch: { parentId: id } }] }, include: { batch: { select: { parentId: true } } } });
      if (!item || item.status !== QuestionImportItemStatus.REVIEW_REQUIRED || item.questionId) throw new ConflictException('Only unresolved review candidates can be rejected');
      const rejected = await tx.questionImportItem.update({ where: { id: item.id }, data: { status: QuestionImportItemStatus.EXCLUDED, exclusionReason: dto.reason.trim(), reviewedAt: new Date(), reviewedById: actor.id, reviewNote: dto.reason.trim() } });
      await this.refreshReviewSummary(tx, item.batchId, item.batch.parentId);
      return rejected;
    });
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_ITEM_REJECTED', targetType: 'QuestionImportItem', targetId: itemId, metadata: { importId: id, reason: dto.reason.trim() } });
    return updated;
  }
  async retry(actor: RequestUser, id: string, itemId?: string): Promise<any> {
    this.admin(actor); this.assertConfigured();
    const parent = await this.prisma.questionImportBatch.findUnique({ where: { id }, include: { children: { select: { id: true, status: true } } } });
    if (parent?.children.length && itemId) {
      const item = await this.prisma.questionImportItem.findFirst({ where: { id: itemId, batch: { parentId: id } }, select: { batchId: true } });
      if (!item) throw new NotFoundException('Question import item not found');
      return this.retry(actor, item.batchId, itemId);
    }
    if (parent?.children.length && !itemId) {
      const retryable = parent.children.filter((child: any) => [QuestionImportStatus.FAILED, QuestionImportStatus.COMPLETED_WITH_ERRORS, QuestionImportStatus.AWAITING_REVIEW].includes(child.status));
      if (!retryable.length) throw new ConflictException('No child imports require retry');
      await this.prisma.questionImportBatch.update({ where: { id }, data: { status: QuestionImportStatus.GENERATING, errorSummary: null, completedAt: null } });
      await Promise.all(retryable.map((child: any) => this.retry(actor, child.id)));
      return this.get(actor, id);
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.questionImportBatch.updateMany({ where: { id, status: { in: [QuestionImportStatus.FAILED, QuestionImportStatus.COMPLETED_WITH_ERRORS, QuestionImportStatus.AWAITING_REVIEW] } }, data: { status: QuestionImportStatus.QUEUED, errorSummary: null, completedAt: null } });
      if (!claimed.count) throw new ConflictException('Only failed, review-required, or completed-with-errors imports can be retried');
      if (itemId) {
        const item = await tx.questionImportItem.findFirst({ where: { id: itemId, batchId: id } });
        if (!item) throw new NotFoundException('Question import item not found');
        if (item.questionId) throw new ConflictException('Created items cannot be retried');
        if (!item.chunkId) throw new ConflictException('Excluded items cannot be retried');
        await tx.questionImportItem.deleteMany({ where: { batchId: id, chunkId: item.chunkId, questionId: null } });
        await tx.questionImportChunk.update({ where: { id: item.chunkId }, data: { status: 'PENDING', errorDetail: null } });
      } else {
        const chunks = await tx.questionImportChunk.findMany({ where: { batchId: id, OR: [{ status: 'FAILED' }, { items: { some: { status: { in: ['INVALID', 'REVIEW_REQUIRED'] } } } }] }, select: { id: true } });
        await tx.questionImportItem.deleteMany({ where: { chunkId: { in: chunks.map((chunk) => chunk.id) }, questionId: null } });
        await tx.questionImportChunk.updateMany({ where: { id: { in: chunks.map((chunk) => chunk.id) } }, data: { status: 'PENDING', errorDetail: null } });
        // Batch retry is deliberately broader than retryPage: reset every
        // unresolved OCR page so the complete PDF transcription can be rerun.
        await tx.questionImportPage.updateMany({ where: { batchId: id, status: { in: ['FAILED', 'REVIEW_REQUIRED'] } }, data: { status: 'PENDING', errorDetail: null } });
      }
    });
    await this.queue.enqueue(id);
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_RETRIED', targetType: 'QuestionImportBatch', targetId: id, metadata: itemId ? { itemId } : undefined });
    return this.get(actor, id);
  }
  async retryChild(actor: RequestUser, parentId: string, childId: string) { this.admin(actor); const child = await this.prisma.questionImportBatch.findFirst({ where: { id: childId, parentId } }); if (!child) throw new NotFoundException('Question import child not found'); await this.retry(actor, childId); return this.get(actor, parentId); }
  async retryPage(actor: RequestUser, id: string, pageNumber: number) { this.admin(actor); this.assertConfigured(); if (!this.ai.pdfTranscriptionModel) throw new ServiceUnavailableException('PDF transcription is not configured'); if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new BadRequestException('pageNumber must be a positive integer'); const batch = await this.prisma.questionImportBatch.findUnique({ where: { id }, select: { inputType: true, sourceAsset: { select: { mimeType: true } } } }); if (!batch || batch.inputType !== QuestionImportInputType.ASSET || batch.sourceAsset?.mimeType !== 'application/pdf') throw new ConflictException('Page transcription retry is available only for PDF imports'); const page = await this.prisma.questionImportPage.findUnique({ where: { batchId_pageNumber: { batchId: id, pageNumber } } }); if (!page) throw new NotFoundException('PDF transcription page not found'); if (!['FAILED', 'REVIEW_REQUIRED'].includes(page.status)) throw new ConflictException('Only failed or review-required pages can be retried'); await this.prisma.$transaction([this.prisma.questionImportPage.update({ where: { id: page.id }, data: { status: 'PENDING', errorDetail: null, warnings: Prisma.JsonNull, uncertainSpans: Prisma.JsonNull } }), this.prisma.questionImportBatch.update({ where: { id }, data: { status: QuestionImportStatus.QUEUED, normalizedText: null, extractionMetadata: Prisma.JsonNull, errorSummary: null, completedAt: null } })]); await this.queue.enqueue(id); return this.get(actor, id); }
  private itemSource(item: any) {
    if (!item.chunk?.text) throw new ConflictException('Review candidate has no retained extraction source');
    const payload = JSON.parse(item.chunk.text);
    const source = (Array.isArray(payload) ? payload : payload.questions)?.[item.sequence - 1];
    if (!source) throw new ConflictException('Review candidate source is unavailable');
    return source;
  }
  private normalizeReviewCandidate(candidate: Record<string, unknown>, source: any, evidence: any[]) {
    const value: any = candidate;
    const type = value?.type;
    if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'LONG_ANSWER'].includes(type) || typeof value.body !== 'string' || !value.body.trim() || typeof value.explanation !== 'string' || !value.explanation.trim()) throw new BadRequestException('Candidate must contain a supported type, body, and explanation');
    if (!['SOURCE_MARKED', 'AI_INFERRED'].includes(value.answerOrigin)) throw new BadRequestException('Candidate must declare SOURCE_MARKED or AI_INFERRED answer provenance');
    if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new BadRequestException('Candidate confidence must be between zero and one');
    if (!Array.isArray(value.warnings) || !value.warnings.every((warning: any) => typeof warning === 'string')) throw new BadRequestException('Candidate warnings must be strings');
    const citedEvidenceKeys = [...new Set(Array.isArray(value.citedEvidenceKeys) ? value.citedEvidenceKeys : [])];
    if (!citedEvidenceKeys.every((key: any) => typeof key === 'string')) throw new BadRequestException('Candidate evidence keys must be strings');
    const relevant = new Set((source.answerEvidence ?? []).map((item: any) => item.evidenceKey));
    const existing = new Set(evidence.map((item) => item.evidenceKey));
    if (citedEvidenceKeys.some((key: string) => !existing.has(key) || !relevant.has(key))) throw new BadRequestException('Candidate cites evidence that is not relevant to this question');
    if (value.answerOrigin === 'SOURCE_MARKED' && !citedEvidenceKeys.length) throw new BadRequestException('SOURCE_MARKED answers require retained source evidence');
    const output: any = { body: value.body.trim(), explanation: value.explanation.trim(), type, warnings: value.warnings, confidence: value.confidence, answerOrigin: value.answerOrigin, citedEvidenceKeys, options: [], acceptedAnswers: [], gradingRubric: undefined };
    if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      if (!Array.isArray(value.options) || value.options.length < 2 || !Array.isArray(value.selectedOptionIndexes)) throw new BadRequestException('Choice candidates require options and selected indexes');
      const selected = new Set(value.selectedOptionIndexes);
      if (![...selected].every((index: any) => Number.isInteger(index) && index >= 0 && index < value.options.length)) throw new BadRequestException('Choice answer indexes are invalid');
      output.options = value.options.map((option: any, index: number) => ({ body: typeof option?.body === 'string' ? option.body.trim() : '', isCorrect: selected.has(index) }));
      const correct = output.options.filter((option: any) => option.isCorrect).length;
      if (output.options.some((option: any) => !option.body) || new Set(output.options.map((option: any) => option.body)).size !== output.options.length || !correct || (type === 'SINGLE_CHOICE' && correct !== 1) || (type === 'MULTIPLE_CHOICE' && correct < 2)) throw new BadRequestException('Choice candidate does not satisfy its answer type');
    } else if (type === 'SHORT_ANSWER' || type === 'FILL_IN_THE_BLANK') {
      output.acceptedAnswers = Array.isArray(value.acceptedAnswers) ? value.acceptedAnswers.map((answer: any) => typeof answer === 'string' ? answer.trim() : '') : [];
      if (!output.acceptedAnswers.length || output.acceptedAnswers.some((answer: string) => !answer) || new Set(output.acceptedAnswers).size !== output.acceptedAnswers.length) throw new BadRequestException('Written candidates require one or more accepted answers');
    } else {
      output.gradingRubric = typeof value.gradingRubric === 'string' ? value.gradingRubric.trim() : '';
      if (!output.gradingRubric) throw new BadRequestException('Long-answer candidates require a grading rubric');
    }
    return output;
  }
  /** Recompute derived progress after a human resolves a review candidate. */
  private async refreshReviewSummary(tx: any, batchId: string, parentId?: string | null) {
    const [created, invalid, reviewRequired, excluded, failedChunks, unfinishedChunks, completedChunks] = await Promise.all([
      tx.questionImportItem.count({ where: { batchId, status: QuestionImportItemStatus.CREATED } }),
      tx.questionImportItem.count({ where: { batchId, status: QuestionImportItemStatus.INVALID } }),
      tx.questionImportItem.count({ where: { batchId, status: QuestionImportItemStatus.REVIEW_REQUIRED } }),
      tx.questionImportItem.count({ where: { batchId, status: QuestionImportItemStatus.EXCLUDED } }),
      tx.questionImportChunk.count({ where: { batchId, status: 'FAILED' } }),
      tx.questionImportChunk.count({ where: { batchId, status: { in: ['PENDING', 'PROCESSING'] } } }),
      tx.questionImportChunk.count({ where: { batchId, status: 'COMPLETED' } }),
    ]);
    const status = unfinishedChunks
      ? QuestionImportStatus.GENERATING
      : failedChunks || invalid || reviewRequired
        ? QuestionImportStatus.COMPLETED_WITH_ERRORS
        : QuestionImportStatus.COMPLETED;
    await tx.questionImportBatch.update({
      where: { id: batchId },
      data: {
        status,
        completedAt: unfinishedChunks ? null : new Date(),
        completedChunks,
        totalItems: created + invalid + reviewRequired + excluded,
        createdQuestions: created,
        invalidItems: invalid + reviewRequired,
        failedItems: failedChunks,
        ...(status === QuestionImportStatus.COMPLETED ? { errorSummary: null } : {}),
      },
    });
    if (parentId) await this.refreshParentReviewSummary(tx, parentId);
  }
  private async refreshParentReviewSummary(tx: any, parentId: string) {
    const children = await tx.questionImportBatch.findMany({ where: { parentId }, select: { status: true, totalItems: true, createdQuestions: true, invalidItems: true, failedItems: true } });
    if (!children.length || children.some((child: any) => ![QuestionImportStatus.COMPLETED, QuestionImportStatus.COMPLETED_WITH_ERRORS, QuestionImportStatus.FAILED, QuestionImportStatus.AWAITING_REVIEW].includes(child.status))) return;
    const failed = children.filter((child: any) => child.status !== QuestionImportStatus.COMPLETED).length;
    await tx.questionImportBatch.update({ where: { id: parentId }, data: {
      status: failed ? QuestionImportStatus.COMPLETED_WITH_ERRORS : QuestionImportStatus.COMPLETED,
      completedAt: new Date(), completedChunks: children.length,
      totalItems: children.reduce((sum: number, child: any) => sum + child.totalItems, 0),
      createdQuestions: children.reduce((sum: number, child: any) => sum + child.createdQuestions, 0),
      invalidItems: children.reduce((sum: number, child: any) => sum + child.invalidItems, 0),
      failedItems: children.reduce((sum: number, child: any) => sum + child.failedItems, 0),
      errorSummary: failed ? `${failed} page range(s) require review or retry` : null,
    } });
  }
  private async rootPdfImport(id: string) {
    const requested = await this.prisma.questionImportBatch.findUnique({ where: { id }, select: { id: true, parentId: true } });
    if (!requested) throw new NotFoundException('Question import not found');
    const batch: any = await this.prisma.questionImportBatch.findUnique({ where: { id: requested.parentId ?? requested.id }, include: { sourceAsset: true } });
    if (!batch?.sourceAsset || batch.sourceAsset.mimeType !== 'application/pdf' || !batch.sourceAsset.storageKey) throw new ConflictException('Visual media is available only for root PDF imports');
    return batch;
  }
  private mediaSummary(media: any) {
    return {
      id: media.id, mediaKey: media.mediaKey, pageNumber: media.pageNumber, type: media.type, confidence: media.confidence, description: media.description,
      normalizedBounds: media.normalizedBounds, renderedBounds: media.renderedBounds, pageDimensions: media.pageDimensions, rotation: media.rotation, renderDpi: media.renderDpi,
      status: media.status, warnings: media.warnings, validationFlags: media.validationFlags, checksum: media.checksum, errorDetail: media.errorDetail,
      review: { reviewedAt: media.reviewedAt, reviewedById: media.reviewedById, note: media.reviewNote },
      preview: media.asset ? this.assets.protectedAccess(media.asset) : null,
      detections: (media.detections ?? []).map((detection: any) => ({ source: detection.source, normalizedBounds: detection.normalizedBounds, type: detection.type, confidence: detection.confidence, description: detection.description, warnings: detection.warnings, validationFlags: detection.validationFlags, accepted: detection.accepted, createdAt: detection.createdAt })),
    };
  }
  private async batch(id: string) { const batch = await this.prisma.questionImportBatch.findUnique({ where: { id }, include: { chunks: { orderBy: { sequence: 'asc' } }, sourceBlocks: { orderBy: { sequence: 'asc' } }, answerEvidence: { orderBy: { evidenceKey: 'asc' } }, skippedRanges: { orderBy: { sequence: 'asc' } }, pages: { orderBy: { pageNumber: 'asc' } }, media: { select: { status: true } }, children: { orderBy: { childSequence: 'asc' }, include: { chunks: { orderBy: { sequence: 'asc' } }, skippedRanges: { orderBy: { sequence: 'asc' } }, _count: { select: { items: true } } } }, _count: { select: { items: true } } } }); if (!batch) throw new NotFoundException('Question import not found'); return batch; }
  private summary(batch: any) { const { rawText, normalizedText, extractionMetadata, ...summary } = batch; return summary; }
  private detail(batch: any) { const skippedRanges = (ranges: any[]) => ranges.map((range) => ({ firstBlock: range.firstBlock, lastBlock: range.lastBlock, reason: range.reason, sourceLocator: range.sourceLocator })); const children = batch.children.map((child: any) => ({ ...this.summary(child), pageScope: child.pageScope, skippedRanges: skippedRanges(child.skippedRanges), chunks: child.chunks.map((chunk: any) => ({ id: chunk.id, sequence: chunk.sequence, status: chunk.status, errorDetail: chunk.errorDetail })) })); const mediaCounts = batch.media.reduce((counts: Record<string, number>, media: any) => { counts[media.status] = (counts[media.status] ?? 0) + 1; return counts; }, {}); return { ...this.summary(batch), extractionMetadata: batch.extractionMetadata, segmentationWarnings: batch.segmentationWarnings, visualMedia: { total: batch.media.length, byStatus: mediaCounts }, transcriptionPages: batch.pages.map((page: any) => ({ pageNumber: page.pageNumber, status: page.status, confidence: page.confidence, uncertainSpans: page.uncertainSpans, warnings: page.warnings, attemptCount: page.attemptCount, verificationPerformed: Boolean(page.verifiedAt), errorDetail: page.errorDetail })), skippedRanges: skippedRanges(batch.skippedRanges), answerEvidence: batch.answerEvidence.map((item: any) => ({ evidenceKey: item.evidenceKey, firstBlock: item.firstBlock, lastBlock: item.lastBlock, text: item.text, sourceLocator: item.sourceLocator, questionIds: item.questionIds })), skippedRangeCount: batch.skippedRanges.length + children.reduce((count: number, child: any) => count + child.skippedRanges.length, 0), sourceBlocks: batch.sourceBlocks.map((block: any) => ({ blockKey: block.blockKey, sequence: block.sequence, sourceLocator: block.sourceLocator, text: block.text })), chunks: batch.chunks.map((chunk: any) => ({ id: chunk.id, sequence: chunk.sequence, sourceLocator: chunk.sourceLocator, status: chunk.status, attemptCount: chunk.attemptCount, errorDetail: chunk.errorDetail })), children }; }
}
