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
    const batch = await this.prisma.questionImportBatch.create({ data: { inputType: asset ? QuestionImportInputType.ASSET : QuestionImportInputType.RAW_TEXT, rawText: dto.rawText?.trim() ?? null, sourceAssetId: asset?.id, bankId: dto.bankId, sourceId: dto.sourceId, courseId: dto.courseId, placements: dto.placements as any, model: this.model, schemaVersion: 'question-import-v2', createdById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_CREATED', targetType: 'QuestionImportBatch', targetId: batch.id });
    await this.queue.enqueue(batch.id);
    return this.summary(batch);
  }
  async list(actor: RequestUser, query: QueryQuestionImportDto) { this.admin(actor); const where: any = query.status ? { status: query.status } : {}; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportBatch.count({ where })]); return { data: data.map((batch) => this.summary(batch)), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async get(actor: RequestUser, id: string) { this.admin(actor); return this.detail(await this.batch(id)); }
  async sourceText(actor: RequestUser, id: string) { this.admin(actor); const batch = await this.batch(id); return { id, normalizedText: batch.normalizedText, extractionMetadata: batch.extractionMetadata, errorSummary: batch.errorSummary, segmentationWarnings: batch.segmentationWarnings }; }
  async updateSourceText(actor: RequestUser, id: string, dto: UpdateQuestionImportSourceTextDto) { this.admin(actor); this.assertConfigured(); const batch = await this.batch(id); if (batch.status !== QuestionImportStatus.AWAITING_REVIEW || batch._count.items) throw new ConflictException('Source text can be changed only for a review-required import with no created items'); const normalizedText = dto.normalizedText.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); if (normalizedText.length < 20) throw new BadRequestException('Source text is too short'); await this.prisma.$transaction([this.prisma.questionImportSourceBlock.deleteMany({ where: { batchId: id } }), this.prisma.questionImportChunk.deleteMany({ where: { batchId: id } }), this.prisma.questionImportBatch.update({ where: { id }, data: { normalizedText, sourceTextEditedAt: new Date(), segmentationRawOutput: Prisma.JsonNull, segmentationUsage: Prisma.JsonNull, segmentationWarnings: Prisma.JsonNull, errorSummary: null, status: QuestionImportStatus.QUEUED, totalChunks: 0, completedChunks: 0 } })]); await this.queue.enqueue(id); await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_SOURCE_TEXT_UPDATED', targetType: 'QuestionImportBatch', targetId: id }); return this.get(actor, id); }
  async items(actor: RequestUser, id: string, query: QueryQuestionImportDto) { this.admin(actor); await this.batch(id); const where: any = { batchId: id, ...(query.status ? { status: query.status } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.questionImportItem.findMany({ where, orderBy: [{ chunk: { sequence: 'asc' } }, { sequence: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.questionImportItem.count({ where })]); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
  async retry(actor: RequestUser, id: string, itemId?: string) {
    this.admin(actor); this.assertConfigured();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.questionImportBatch.updateMany({ where: { id, status: { in: [QuestionImportStatus.FAILED, QuestionImportStatus.COMPLETED_WITH_ERRORS] } }, data: { status: QuestionImportStatus.QUEUED, errorSummary: null, completedAt: null } });
      if (!claimed.count) throw new ConflictException('Only failed or completed-with-errors imports can be retried');
      if (itemId) {
        const item = await tx.questionImportItem.findFirst({ where: { id: itemId, batchId: id } });
        if (!item) throw new NotFoundException('Question import item not found');
        if (item.questionId) throw new ConflictException('Created items cannot be retried');
        if (!item.chunkId) throw new ConflictException('Excluded items cannot be retried');
        await tx.questionImportItem.deleteMany({ where: { batchId: id, chunkId: item.chunkId, questionId: null } });
        await tx.questionImportChunk.update({ where: { id: item.chunkId }, data: { status: 'PENDING', errorDetail: null } });
      } else {
        const chunks = await tx.questionImportChunk.findMany({ where: { batchId: id, OR: [{ status: 'FAILED' }, { items: { some: { status: 'INVALID' } } }] }, select: { id: true } });
        await tx.questionImportItem.deleteMany({ where: { chunkId: { in: chunks.map((chunk) => chunk.id) }, questionId: null } });
        await tx.questionImportChunk.updateMany({ where: { id: { in: chunks.map((chunk) => chunk.id) } }, data: { status: 'PENDING', errorDetail: null } });
      }
    });
    await this.queue.enqueue(id);
    await this.audit.record({ actorUserId: actor.id, action: 'AI_QUESTION_IMPORT_RETRIED', targetType: 'QuestionImportBatch', targetId: id, metadata: itemId ? { itemId } : undefined });
    return this.get(actor, id);
  }
  private async batch(id: string) { const batch = await this.prisma.questionImportBatch.findUnique({ where: { id }, include: { chunks: { orderBy: { sequence: 'asc' } }, sourceBlocks: { orderBy: { sequence: 'asc' } }, _count: { select: { items: true } } } }); if (!batch) throw new NotFoundException('Question import not found'); return batch; }
  private summary(batch: any) { const { rawText, normalizedText, extractionMetadata, ...summary } = batch; return summary; }
  private detail(batch: any) { return { ...this.summary(batch), extractionMetadata: batch.extractionMetadata, segmentationWarnings: batch.segmentationWarnings, sourceBlocks: batch.sourceBlocks.map((block: any) => ({ blockKey: block.blockKey, sequence: block.sequence, sourceLocator: block.sourceLocator, text: block.text })), chunks: batch.chunks.map((chunk: any) => ({ id: chunk.id, sequence: chunk.sequence, sourceLocator: chunk.sourceLocator, status: chunk.status, attemptCount: chunk.attemptCount, errorDetail: chunk.errorDetail })) }; }
}
