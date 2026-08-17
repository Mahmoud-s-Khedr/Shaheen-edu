import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AssetKind, AssetStatus, QuestionImportInputType, QuestionImportStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { QuestionImportQueue } from './question-import.queue';
import type { CreateQuestionImportDto, QueryQuestionImportDto } from './dto/question-import.dto';
import type { UpdateQuestionImportSourceTextDto } from './dto/question-import.dto';
import { QuestionBanksService } from '../question-banks/question-banks.service';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class QuestionImportService {
  private readonly model: string;
  private readonly ai: AppConfig['ai'];
  constructor(private readonly prisma: PrismaService, private readonly queue: QuestionImportQueue, private readonly audit: AuditService, private readonly questions: QuestionBanksService, config: ConfigService<AppConfig, true>) { this.ai = config.get('ai', { infer: true }); this.model = this.ai.questionImportModel; }
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
    const batch = await this.prisma.questionImportBatch.create({ data: { inputType: asset ? QuestionImportInputType.ASSET : QuestionImportInputType.RAW_TEXT, rawText: dto.rawText?.trim() ?? null, sourceAssetId: asset?.id, bankId: dto.bankId, sourceId: dto.sourceId, courseId: dto.courseId, placements: dto.placements as any, model: this.model, schemaVersion: 'question-import-v2', createdById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_CREATED', targetType: 'QuestionImportBatch', targetId: batch.id });
    await this.queue.enqueue(batch.id);
    return this.summary(batch);
  }
  async list(actor: RequestUser, query: QueryQuestionImportDto) { this.admin(actor); const where: any = { parentId: null, ...(query.status ? { status: query.status } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportBatch.count({ where })]); return { data: data.map((batch) => this.summary(batch)), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async get(actor: RequestUser, id: string) { this.admin(actor); return this.detail(await this.batch(id)); }
  async sourceText(actor: RequestUser, id: string) { this.admin(actor); const batch = await this.batch(id); return { id, normalizedText: batch.normalizedText, extractionMetadata: batch.extractionMetadata, errorSummary: batch.errorSummary, segmentationWarnings: batch.segmentationWarnings, pages: batch.pages.map((page: any) => ({ pageNumber: page.pageNumber, status: page.status, canonicalText: page.canonicalText, confidence: page.confidence, uncertainSpans: page.uncertainSpans, warnings: page.warnings })) }; }
  async updateSourceText(actor: RequestUser, id: string, dto: UpdateQuestionImportSourceTextDto) { this.admin(actor); this.assertConfigured(); const batch = await this.batch(id); if (batch.status !== QuestionImportStatus.AWAITING_REVIEW || batch._count.items) throw new ConflictException('Source text can be changed only for a review-required import with no created items'); const normalizedText = dto.normalizedText.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (normalizedText.length < 20) throw new BadRequestException('Source text is too short'); await this.prisma.$transaction([this.prisma.questionImportSkippedRange.deleteMany({ where: { batchId: id } }), this.prisma.questionImportSourceBlock.deleteMany({ where: { batchId: id } }), this.prisma.questionImportChunk.deleteMany({ where: { batchId: id } }), this.prisma.questionImportBatch.update({ where: { id }, data: { normalizedText, sourceTextEditedAt: new Date(), segmentationRawOutput: Prisma.JsonNull, segmentationUsage: Prisma.JsonNull, segmentationWarnings: Prisma.JsonNull, errorSummary: null, status: QuestionImportStatus.QUEUED, totalChunks: 0, completedChunks: 0 } })]); await this.queue.enqueue(id); await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_SOURCE_TEXT_UPDATED', targetType: 'QuestionImportBatch', targetId: id }); return this.get(actor, id); }
  async items(actor: RequestUser, id: string, query: QueryQuestionImportDto) { this.admin(actor); const batch = await this.batch(id); const batchIds = batch.children.length ? batch.children.map((child: any) => child.id) : [id]; const where: any = { batchId: { in: batchIds }, ...(query.status ? { status: query.status } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportItem.findMany({ where, orderBy: [{ batch: { childSequence: 'asc' } }, { chunk: { sequence: 'asc' } }, { sequence: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportItem.count({ where })]); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
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
  private async batch(id: string) { const batch = await this.prisma.questionImportBatch.findUnique({ where: { id }, include: { chunks: { orderBy: { sequence: 'asc' } }, sourceBlocks: { orderBy: { sequence: 'asc' } }, skippedRanges: { orderBy: { sequence: 'asc' } }, pages: { orderBy: { pageNumber: 'asc' } }, children: { orderBy: { childSequence: 'asc' }, include: { chunks: { orderBy: { sequence: 'asc' } }, skippedRanges: { orderBy: { sequence: 'asc' } }, _count: { select: { items: true } } } }, _count: { select: { items: true } } } }); if (!batch) throw new NotFoundException('Question import not found'); return batch; }
  private summary(batch: any) { const { rawText, normalizedText, extractionMetadata, ...summary } = batch; return summary; }
  private detail(batch: any) { const skippedRanges = (ranges: any[]) => ranges.map((range) => ({ firstBlock: range.firstBlock, lastBlock: range.lastBlock, reason: range.reason, sourceLocator: range.sourceLocator })); const children = batch.children.map((child: any) => ({ ...this.summary(child), pageScope: child.pageScope, skippedRanges: skippedRanges(child.skippedRanges), chunks: child.chunks.map((chunk: any) => ({ id: chunk.id, sequence: chunk.sequence, status: chunk.status, errorDetail: chunk.errorDetail })) })); return { ...this.summary(batch), extractionMetadata: batch.extractionMetadata, segmentationWarnings: batch.segmentationWarnings, transcriptionPages: batch.pages.map((page: any) => ({ pageNumber: page.pageNumber, status: page.status, confidence: page.confidence, uncertainSpans: page.uncertainSpans, warnings: page.warnings, attemptCount: page.attemptCount, verificationPerformed: Boolean(page.verifiedAt), errorDetail: page.errorDetail })), skippedRanges: skippedRanges(batch.skippedRanges), skippedRangeCount: batch.skippedRanges.length + children.reduce((count: number, child: any) => count + child.skippedRanges.length, 0), sourceBlocks: batch.sourceBlocks.map((block: any) => ({ blockKey: block.blockKey, sequence: block.sequence, sourceLocator: block.sourceLocator, text: block.text })), chunks: batch.chunks.map((chunk: any) => ({ id: chunk.id, sequence: chunk.sequence, sourceLocator: chunk.sourceLocator, status: chunk.status, attemptCount: chunk.attemptCount, errorDetail: chunk.errorDetail })), children }; }
}
