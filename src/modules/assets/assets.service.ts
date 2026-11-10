import { assertContentStaff } from '../../common/authorization/admin-authorization';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  AssetKind,
  AssetStatus,
  ContentItemType,
  ContentStatus,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  toPaginationMeta,
  type PaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { isPrismaForeignKeyConstraintError } from '../../common/utils/prisma-errors';
import { AuditService } from '../audit/audit.service';
import { BunnyStorageProvider } from './bunny-storage.provider';

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pptxMime =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentMimes = new Set([
  'application/pdf',
  docxMime,
  xlsxMime,
  pptxMime,
]);
const downloadMimes = new Set([
  ...documentMimes,
  'application/zip',
  'text/csv',
  'text/plain',
]);
// Declared MIME -> allowed filename extensions. The extension must match the declared MIME (already validated against the kind), tying extension -> MIME -> kind.
const mimeExtensions: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  [docxMime]: ['.docx'],
  [xlsxMime]: ['.xlsx'],
  [pptxMime]: ['.pptx'],
  'application/zip': ['.zip'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: BunnyStorageProvider,
    config: ConfigService<AppConfig, true>,
  ) {
    this.config = config.get('storage', { infer: true });
  }
  private readonly config: AppConfig['storage'];

  private assertAdmin(actor: RequestUser) {
    assertContentStaff(actor);
  }
  private allowed(kind: AssetKind) {
    return kind === AssetKind.COVER_IMAGE ||
      kind === AssetKind.IMAGE ||
      kind === AssetKind.PAYMENT_PROOF
      ? imageMimes
      : kind === AssetKind.PDF
        ? new Set(['application/pdf'])
        : kind === AssetKind.DOCUMENT
          ? documentMimes
          : downloadMimes;
  }
  private limit(kind: AssetKind) {
    return kind === AssetKind.COVER_IMAGE ||
      kind === AssetKind.IMAGE ||
      kind === AssetKind.PAYMENT_PROOF
      ? this.config.imageMaxBytes
      : kind === AssetKind.DOWNLOADABLE_FILE
        ? this.config.downloadMaxBytes
        : this.config.documentMaxBytes;
  }
  private filename(name: string) {
    const sanitized = name
      .normalize('NFKC')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 180);
    if (!sanitized || sanitized === '.' || sanitized === '..')
      throw new BadRequestException('Invalid filename');
    return sanitized;
  }
  private assertExtension(mimetype: string, filename: string) {
    const dot = filename.lastIndexOf('.');
    const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
    if (!(mimeExtensions[mimetype] ?? []).includes(extension))
      throw new BadRequestException(
        'Filename extension does not match declared type',
      );
  }

  async authorizeUpload(
    actor: RequestUser,
    kind: AssetKind,
    input: { filename: string; mimeType: string },
  ) {
    this.assertAdmin(actor);
    if (kind === AssetKind.PAYMENT_PROOF)
      throw new BadRequestException(
        'Payment proofs must use the student payment endpoint',
      );
    return this.authorizeFor(actor, kind, input);
  }

  async authorizePaymentProof(
    actor: RequestUser,
    input: { filename: string; mimeType: string },
  ) {
    if (actor.role !== Role.STUDENT) throw new ForbiddenException('Forbidden');
    return this.authorizeFor(actor, AssetKind.PAYMENT_PROOF, input);
  }

  private async authorizeFor(
    actor: RequestUser,
    kind: AssetKind,
    input: { filename: string; mimeType: string },
  ) {
    if (kind === AssetKind.VIDEO)
      throw new BadRequestException('Use the video asset endpoint for videos');
    const filename = this.filename(input.filename);
    if (!this.allowed(kind).has(input.mimeType))
      throw new BadRequestException('Unsupported MIME type for asset kind');
    this.assertExtension(input.mimeType, filename);
    const key = `assets/${kind.toLowerCase()}/${randomUUID()}-${filename}`;
    const asset = await this.prisma.asset.create({
      data: {
        provider: 'BUNNY_STORAGE',
        kind,
        status: AssetStatus.UPLOADING,
        originalFilename: input.filename,
        filename,
        storageKey: key,
        mimeType: input.mimeType,
        uploadedById: actor.id,
      },
    });
    const expiresAt = new Date(
      Date.now() + this.config.uploadTtlSeconds * 1000,
    );
    return {
      asset: this.summary(asset),
      upload: {
        url: await this.storage.createUploadUrl(
          key,
          input.mimeType,
          this.config.uploadTtlSeconds,
        ),
        method: 'PUT',
        headers: { 'content-type': input.mimeType },
        expiresAt,
      },
    };
  }

  async completeUpload(actor: RequestUser, id: string) {
    const asset = await this.getReadyOrAny(id);
    if (
      asset.provider !== 'BUNNY_STORAGE' ||
      asset.kind === AssetKind.VIDEO ||
      asset.uploadedById !== actor.id ||
      (actor.role !== Role.STUDENT &&
        actor.role !== Role.ADMIN &&
        actor.role !== Role.SUPER_ADMIN)
    )
      throw new NotFoundException('Asset not found');
    if (actor.role === Role.STUDENT && asset.kind !== AssetKind.PAYMENT_PROOF)
      throw new NotFoundException('Asset not found');
    if (actor.role === Role.ADMIN && asset.kind === AssetKind.PAYMENT_PROOF)
      throw new NotFoundException('Asset not found');
    if (asset.status === AssetStatus.READY) return this.summary(asset);
    if (asset.status !== AssetStatus.UPLOADING || !asset.storageKey)
      throw new ConflictException(
        'Asset cannot be completed in its current state',
      );
    try {
      const object = await this.inspectAfterDirectUpload(asset.storageKey);
      if (!object.sizeBytes)
        throw new BadRequestException('Empty files are not allowed');
      if (object.sizeBytes > this.limit(asset.kind))
        throw new BadRequestException('File exceeds configured size limit');
      if (object.mimeType && object.mimeType !== asset.mimeType)
        throw new BadRequestException(
          'Uploaded MIME type does not match authorization',
        );
      this.assertMagic(asset.kind, asset.mimeType, object.first);
      const ready = await this.prisma.asset.update({
        where: { id },
        data: {
          status: AssetStatus.READY,
          sizeBytes: object.sizeBytes,
          readyAt: new Date(),
          failedAt: null,
        },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'ASSET_UPLOADED',
        targetType: 'Asset',
        targetId: id,
        metadata: { kind: asset.kind, sizeBytes: object.sizeBytes },
      });
      return this.summary(ready);
    } catch (error) {
      await this.prisma.asset.update({
        where: { id },
        data: {
          status: AssetStatus.FAILED,
          failedAt: new Date(),
          metadata: { error: 'upload_verification_failed' },
        },
      });
      void this.storage.delete(asset.storageKey).catch(() => undefined);
      throw error;
    }
  }

  private assertMagic(kind: AssetKind, mime: string, first: Buffer) {
    const png = first
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = first.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    const webp =
      first.subarray(0, 4).toString() === 'RIFF' &&
      first.subarray(8, 12).toString() === 'WEBP';
    const pdf = first.subarray(0, 5).toString() === '%PDF-';
    // OOXML (docx/xlsx/pptx) and plain zips are ZIP containers: 'PK\x03\x04', 'PK\x05\x06' (empty), or 'PK\x07\x08' (spanned). text/csv and text/plain have no reliable signature.
    const zip =
      first.subarray(0, 2).toString() === 'PK' &&
      [3, 5, 7].includes(first[2]) &&
      first[3] === first[2] + 1;
    if (
      (mime === 'image/png' && !png) ||
      (mime === 'image/jpeg' && !jpg) ||
      (mime === 'image/webp' && !webp) ||
      ((kind === AssetKind.PDF || mime === 'application/pdf') && !pdf) ||
      ((mime === docxMime ||
        mime === xlsxMime ||
        mime === pptxMime ||
        mime === 'application/zip') &&
        !zip)
    )
      throw new BadRequestException(
        'File signature does not match declared MIME type',
      );
  }

  /**
   * Bunny's S3-compatible endpoint can briefly return 404 immediately after a
   * successful presigned PUT.  The client has no server-side signal to await,
   * so verify with a short, bounded retry before declaring the upload failed.
   */
  private async inspectAfterDirectUpload(key: string) {
    const retryDelaysMs = [100, 250, 500, 1_000, 2_000];
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.storage.inspect(key);
      } catch (error) {
        const statusCode = (
          error as { $metadata?: { httpStatusCode?: number } }
        )?.$metadata?.httpStatusCode;
        if (statusCode !== 404 || attempt === retryDelaysMs.length) throw error;
        await new Promise<void>((resolve) =>
          setTimeout(resolve, retryDelaysMs[attempt]),
        );
      }
    }
  }

  async get(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const asset = await this.getReadyOrAny(id);
    if (asset.kind === AssetKind.PAYMENT_PROOF)
      throw new NotFoundException('Asset not found');
    return this.summary(asset);
  }
  async list(actor: RequestUser, query: PaginationQueryDto) {
    this.assertAdmin(actor);
    const where = { kind: { not: AssetKind.PAYMENT_PROOF } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return {
      data: data.map((x) => this.summary(x)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
  async archive(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockForReference(tx, id);
      const asset = await this.getReadyOrAny(id, tx);
      if (asset.kind === AssetKind.PAYMENT_PROOF)
        throw new NotFoundException('Asset not found');
      if (await this.isReferenced(id, tx))
        throw new ConflictException('Referenced assets cannot be archived');
      return tx.asset.update({
        where: { id },
        data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ASSET_ARCHIVED',
      targetType: 'Asset',
      targetId: id,
    });
    return this.summary(updated);
  }
  async delete(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { video: true },
    });
    if (!asset || asset.kind === AssetKind.PAYMENT_PROOF)
      throw new NotFoundException('Asset not found');
    if (asset.video)
      throw new BadRequestException(
        'Use the video asset endpoints to manage video assets',
      );
    if (await this.isReferenced(id))
      throw new ConflictException('Referenced assets cannot be deleted');
    // Delete the database row first. Its foreign keys are the final,
    // concurrency-safe reference check: deleting the object first could leave
    // a live reference pointing at missing storage if a reference is created
    // between isReferenced() and this delete.
    try {
      await this.prisma.asset.delete({ where: { id } });
    } catch (error) {
      // A new reference can be committed after isReferenced() completes.
      // The database is authoritative in that race, including PostgreSQL's
      // SQLSTATE 23001 RESTRICT violation surfaced by Prisma as unknown.
      if (isPrismaForeignKeyConstraintError(error))
        throw new ConflictException('Referenced assets cannot be deleted');
      throw error;
    }
    if (asset.storageKey)
      void this.storage.delete(asset.storageKey).catch(() => undefined);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ASSET_DELETED',
      targetType: 'Asset',
      targetId: id,
    });
    return { id, deleted: true };
  }
  /** Archives an asset displaced by a replacement, but only once nothing else references it. */
  async archiveIfUnreferenced(actor: Pick<RequestUser, 'id'>, id: string) {
    const archived = await this.prisma.$transaction(async (tx) => {
      await this.lockForReference(tx, id);
      const asset = await tx.asset.findUnique({ where: { id } });
      if (
        !asset ||
        asset.kind === AssetKind.PAYMENT_PROOF ||
        asset.status === AssetStatus.ARCHIVED ||
        (await this.isReferenced(id, tx))
      )
        return false;
      await tx.asset.update({
        where: { id },
        data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() },
      });
      return true;
    });
    if (!archived) return;
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ASSET_REPLACED',
      targetType: 'Asset',
      targetId: id,
    });
  }
  /** Hold until commit when assigning a reference or deciding to archive. */
  async lockForReference(client: Prisma.TransactionClient, id: string) {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-reference:${id}`}))`;
  }
  async getReady(id: string, client: Prisma.TransactionClient = this.prisma) {
    const asset = await this.getReadyOrAny(id, client);
    if (asset.status !== AssetStatus.READY)
      throw new ConflictException('Asset is not ready');
    return asset;
  }
  async getReadyOrAny(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const asset = await client.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
  async isReferenced(id: string, client?: Prisma.TransactionClient) {
    const db = client ?? this.prisma;
    const queries = [
      db.contentItem.count({ where: { primaryAssetId: id } }),
      db.assetReference.count({ where: { assetId: id } }),
      db.academicGrade.count({ where: { coverAssetId: id } }),
      db.subject.count({ where: { coverAssetId: id } }),
      db.course.count({ where: { coverAssetId: id } }),
      db.chapter.count({ where: { coverAssetId: id } }),
      db.lesson.count({ where: { coverAssetId: id } }),
      db.section.count({ where: { coverAssetId: id } }),
      db.questionAsset.count({ where: { assetId: id } }),
      db.questionContentBlock.count({ where: { assetId: id } }),
      db.questionOptionContentBlock.count({ where: { assetId: id } }),
      db.questionContextContentBlock.count({ where: { assetId: id } }),
      db.questionVideoLink.count({ where: { videoAssetId: id } }),
      db.assessmentQuestion.count({ where: { videoAssetId: id } }),
      db.assessmentQuestionAsset.count({ where: { assetId: id } }),
      db.assessmentQuestionContentBlock.count({
        where: { assetId: id },
      }),
      db.assessmentQuestionOptionContentBlock.count({
        where: { assetId: id },
      }),
      db.assessmentContextContentBlock.count({
        where: { assetId: id },
      }),
      db.questionImportMedia.count({ where: { assetId: id } }),
      db.testimonial.count({ where: { screenshotAssetId: id } }),
      db.questionImportBatch.count({ where: { sourceAssetId: id } }),
      db.salesOffer.count({ where: { coverAssetId: id } }),
    ];
    const [
      content,
      refs,
      grades,
      subjects,
      courses,
      chapters,
      lessons,
      sections,
      questionAssets,
      questionBlocks,
      questionOptionBlocks,
      questionContextBlocks,
      questionVideos,
      assessmentQuestionVideos,
      assessmentQuestionAttachments,
      snapshotBlocks,
      snapshotOptionBlocks,
      snapshotContextBlocks,
      questionImportMedia,
      testimonials,
      questionImportBatches = 0,
      salesOfferCovers = 0,
    ] = client
      ? await Promise.all(queries)
      : await this.prisma.$transaction(queries);
    const paymentProofs = await db.manualPaymentSubmission.count({
      where: { proofAssetId: id },
    });
    return (
      content +
        refs +
        grades +
        subjects +
        courses +
        chapters +
        lessons +
        sections +
        questionAssets +
        questionBlocks +
        questionOptionBlocks +
        questionContextBlocks +
        questionVideos +
        assessmentQuestionVideos +
        assessmentQuestionAttachments +
        snapshotBlocks +
        snapshotOptionBlocks +
        snapshotContextBlocks +
        questionImportMedia +
        testimonials +
        questionImportBatches +
        salesOfferCovers +
        paymentProofs >
      0
    );
  }
  assertCompatible(asset: { kind: AssetKind }, type: ContentItemType) {
    if (asset.kind === AssetKind.PAYMENT_PROOF)
      throw new BadRequestException('Payment proofs cannot be content assets');
    const expected: Record<ContentItemType, AssetKind | undefined> = {
      TEXT: undefined,
      EXTERNAL_LINK: undefined,
      VIDEO: AssetKind.VIDEO,
      PDF: AssetKind.PDF,
      IMAGE: AssetKind.IMAGE,
      DOCUMENT: AssetKind.DOCUMENT,
      DOWNLOADABLE_FILE: AssetKind.DOWNLOADABLE_FILE,
    };
    if (expected[type] && asset.kind !== expected[type])
      throw new BadRequestException(
        'Asset kind is incompatible with content type',
      );
  }
  protectedUrl(asset: { storageKey: string | null }) {
    if (!asset.storageKey)
      throw new ConflictException('Asset has no file delivery URL');
    return this.storage.createProtectedUrl(
      asset.storageKey,
      new Date(Date.now() + this.config.urlTtlSeconds * 1000),
    );
  }
  protectedAccess(asset: { storageKey: string | null }) {
    const expiresAt = new Date(Date.now() + this.config.urlTtlSeconds * 1000);
    if (!asset.storageKey)
      throw new ConflictException('Asset has no file delivery URL');
    return {
      url: this.storage.createProtectedUrl(asset.storageKey, expiresAt),
      expiresAt,
    };
  }
  async adminAccess(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const asset = await this.getReady(id);
    if (
      asset.kind === AssetKind.PAYMENT_PROOF ||
      asset.kind === AssetKind.VIDEO
    )
      throw new NotFoundException('Asset preview is not available');
    return this.protectedAccess(asset);
  }

  /** Public only for fully published hierarchy covers; archived paths require a retained student snapshot. */
  async coverAccess(resource: string, id: string, studentUserId?: string) {
    const target = await this.coverTarget(resource, id);
    if (!target.coverAssetId)
      throw new NotFoundException('Cover image not found');
    const asset = await this.getReady(target.coverAssetId);
    if (asset.kind !== AssetKind.COVER_IMAGE && asset.kind !== AssetKind.IMAGE)
      throw new NotFoundException('Cover image not found');
    const draft = target.nodes.find(
      (node: any) => node.status === ContentStatus.DRAFT,
    );
    if (draft) throw new NotFoundException('Cover image not found');
    const archived = target.nodes.find(
      (node: any) => node.status === ContentStatus.ARCHIVED,
    );
    if (archived) {
      if (!studentUserId)
        throw new ForbiddenException('Student authentication is required');
      const retained = await (
        this.prisma as any
      ).archivedAccessSnapshot.findFirst({
        where: {
          studentUserId,
          resourceType: archived.type,
          resourceId: archived.id,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (!retained)
        throw new ForbiddenException('Archived access is required');
    }
    return this.protectedAccess(asset);
  }

  private async coverTarget(
    resource: string,
    id: string,
  ): Promise<{ coverAssetId: string | null; nodes: any[] }> {
    if (resource === 'grades') {
      const x = await this.prisma.academicGrade.findUnique({ where: { id } });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [{ ...x, type: 'ACADEMIC_GRADE' }],
      };
    }
    if (resource === 'subjects') {
      const x = await this.prisma.subject.findUnique({
        where: { id },
        include: { gradeAssignments: true },
      });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [{ ...x, type: 'SUBJECT' }],
      };
    }
    if (resource === 'courses') {
      const x = await this.prisma.course.findUnique({
        where: { id },
        include: { subject: true },
      });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [
          { ...x, type: 'COURSE' },
          { ...x.subject, type: 'SUBJECT' },
        ],
      };
    }
    if (resource === 'chapters') {
      const x = await this.prisma.chapter.findUnique({
        where: { id },
        include: {
          course: {
            include: { subject: true },
          },
        },
      });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [
          { ...x, type: 'CHAPTER' },
          { ...x.course, type: 'COURSE' },
          { ...x.course.subject, type: 'SUBJECT' },
        ],
      };
    }
    if (resource === 'lessons') {
      const x = await this.prisma.lesson.findUnique({
        where: { id },
        include: {
          chapter: {
            include: {
              course: {
                include: { subject: true },
              },
            },
          },
        },
      });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [
          { ...x, type: 'LESSON' },
          { ...x.chapter, type: 'CHAPTER' },
          { ...x.chapter.course, type: 'COURSE' },
          { ...x.chapter.course.subject, type: 'SUBJECT' },
        ],
      };
    }
    if (resource === 'sections') {
      const x = await this.prisma.section.findUnique({
        where: { id },
        include: {
          lesson: {
            include: {
              chapter: {
                include: {
                  course: {
                    include: { subject: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!x) throw new NotFoundException('Hierarchy record not found');
      return {
        coverAssetId: x.coverAssetId,
        nodes: [
          { ...x, type: 'SECTION' },
          { ...x.lesson, type: 'LESSON' },
          { ...x.lesson.chapter, type: 'CHAPTER' },
          { ...x.lesson.chapter.course, type: 'COURSE' },
          { ...x.lesson.chapter.course.subject, type: 'SUBJECT' },
        ],
      };
    }
    throw new BadRequestException('Unsupported cover resource');
  }
  async setCover(
    actor: RequestUser,
    resource: string,
    id: string,
    assetId: string,
  ) {
    this.assertAdmin(actor);
    const asset = await this.getReady(assetId);
    if (asset.kind !== AssetKind.COVER_IMAGE && asset.kind !== AssetKind.IMAGE)
      throw new BadRequestException('A cover must be an image asset');
    const clients: Record<string, { findUnique: Function; update: Function }> =
      {
        grades: this.prisma.academicGrade,
        subjects: this.prisma.subject,
        courses: this.prisma.course,
        chapters: this.prisma.chapter,
        lessons: this.prisma.lesson,
        sections: this.prisma.section,
      };
    const client = clients[resource];
    if (!client) throw new BadRequestException('Unsupported cover resource');
    const record = (await client.findUnique({ where: { id } })) as {
      coverAssetId: string | null;
    } | null;
    if (!record) throw new NotFoundException('Hierarchy record not found');
    const previousCoverId = record.coverAssetId;
    await client.update({ where: { id }, data: { coverAssetId: assetId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'HIERARCHY_COVER_SET',
      targetType: resource,
      targetId: id,
      metadata: { assetId },
    });
    if (previousCoverId && previousCoverId !== assetId)
      await this.archiveIfUnreferenced(actor, previousCoverId);
    return this.get(actor, assetId);
  }
  async removeCover(actor: RequestUser, resource: string, id: string) {
    this.assertAdmin(actor);
    const clients: Record<string, { findUnique: Function; update: Function }> =
      {
        grades: this.prisma.academicGrade,
        subjects: this.prisma.subject,
        courses: this.prisma.course,
        chapters: this.prisma.chapter,
        lessons: this.prisma.lesson,
        sections: this.prisma.section,
      };
    const client = clients[resource];
    if (!client) throw new BadRequestException('Unsupported cover resource');
    const record = await client.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Hierarchy record not found');
    await client.update({ where: { id }, data: { coverAssetId: null } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'HIERARCHY_COVER_REMOVED',
      targetType: resource,
      targetId: id,
    });
    return { id, coverAssetId: null };
  }
  private summary(asset: any) {
    return {
      id: asset.id,
      provider: asset.provider,
      kind: asset.kind,
      status: asset.status,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum,
      createdAt: asset.createdAt,
      readyAt: asset.readyAt,
      failedAt: asset.failedAt,
      archivedAt: asset.archivedAt,
    };
  }
}
