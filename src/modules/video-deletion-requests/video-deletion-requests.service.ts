import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, VideoDeletionRequest } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { assertSuperAdmin } from '../../common/authorization/admin-authorization';
import { assertTeacherVideo } from '../../common/authorization/course-scope';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  toPaginationMeta,
  PaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';

// Includes plain snapshot references as well as FK-backed references. Keep this
// inventory aligned with the database reference guards in the migration.
export const VIDEO_REFERENCES = [
  ['videoFeedback', 'videoAssetId'],
  ['contentItem', 'primaryAssetId'],
  ['assetReference', 'assetId'],
  ['questionVideoLink', 'videoAssetId'],
  ['assessmentQuestion', 'videoAssetId'],
  ['questionAsset', 'assetId'],
  ['questionContentBlock', 'assetId'],
  ['questionOptionContentBlock', 'assetId'],
  ['questionContextContentBlock', 'assetId'],
  ['assessmentQuestionAsset', 'assetId'],
  ['assessmentQuestionContentBlock', 'assetId'],
  ['assessmentQuestionOptionContentBlock', 'assetId'],
  ['assessmentContextContentBlock', 'assetId'],
] as const;

@Injectable()
export class VideoDeletionRequestsService {
  private readonly stream: AppConfig['stream'];
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.stream = config.get('stream', { infer: true });
  }
  private reader(actor: RequestUser) {
    if (actor.role !== Role.TEACHER && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private async request(
    db: Prisma.TransactionClient,
    actor: RequestUser,
    id: string,
  ) {
    this.reader(actor);
    const request = await db.videoDeletionRequest.findFirst({
      where: {
        id,
        ...(actor.role === Role.TEACHER ? { requesterId: actor.id } : {}),
      },
    });
    if (!request) throw new NotFoundException('Deletion request not found');
    return request;
  }
  private async target(db: Prisma.TransactionClient, assetId: string) {
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      include: {
        video: true,
        primaryFor: { include: { placement: true } },
        uploadContentItem: { include: { placement: true } },
      },
    });
    if (!asset?.video) throw new NotFoundException('Video asset not found');
    const owner = asset.primaryFor[0] ?? asset.uploadContentItem;
    if (!asset.primaryFor.length && owner?.primaryAssetId)
      throw new ConflictException(
        'Video target changed; submit a fresh request',
      );
    if (!owner?.placement || owner.type !== 'VIDEO')
      throw new ConflictException('Video has no curriculum target');
    return { asset, owner, courseId: owner.placement.resolvedCourseId };
  }
  private async references(db: Prisma.TransactionClient, assetId: string) {
    const rows = await Promise.all(
      VIDEO_REFERENCES.map(async ([model, field]) => {
        const records = await (db[model] as any).findMany({
          where: { [field]: assetId },
          select: { id: true },
        });
        return [
          model,
          {
            count: records.length,
            ids: records.map((r: { id: string }) => r.id),
          },
        ];
      }),
    );
    return Object.fromEntries(rows);
  }
  async create(actor: RequestUser, assetId: string, reason: string) {
    if (actor.role !== Role.TEACHER)
      throw new ForbiddenException('Only teachers request deletion');
    await assertTeacherVideo(this.prisma, actor, assetId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-reference:${assetId}`}))`;
      const { asset, owner, courseId } = await this.target(tx, assetId);
      if (asset.deletionStartedAt)
        throw new ConflictException('Video deletion is in progress');
      const active = await tx.videoDeletionRequest.findFirst({
        where: {
          assetId,
          OR: [
            { decision: 'PENDING' },
            { decision: 'APPROVED', execution: { not: 'COMPLETED' } },
          ],
        },
      });
      if (active)
        throw new ConflictException(
          'An active deletion request already exists',
        );
      const created = await tx.videoDeletionRequest.create({
        data: {
          requesterId: actor.id,
          assetId,
          contentItemId: owner.id,
          courseId,
          reason,
          snapshot: {
            title: owner.title,
            status: owner.status,
            filename: asset.filename,
            libraryId: asset.video!.libraryId,
            bunnyVideoId: asset.video!.bunnyVideoId,
            unfinishedUpload: !asset.primaryFor.length,
          },
        },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'VIDEO_DELETION_REQUESTED',
        targetType: 'VideoDeletionRequest',
        targetId: created.id,
        metadata: { assetId, courseId },
      });
      return created;
    });
  }
  async list(actor: RequestUser, query: PaginationQueryDto) {
    this.reader(actor);
    const where = actor.role === Role.TEACHER ? { requesterId: actor.id } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.videoDeletionRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.videoDeletionRequest.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async get(actor: RequestUser, id: string) {
    const request = await this.request(this.prisma, actor, id);
    return {
      ...request,
      ...(actor.role === Role.SUPER_ADMIN
        ? {
            affectedReferences: await this.references(
              this.prisma,
              request.assetId,
            ),
          }
        : {}),
    };
  }
  async reject(actor: RequestUser, id: string, reason: string) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VideoDeletionRequest" WHERE id = ${id} FOR UPDATE`;
      const request = await this.request(tx, actor, id);
      if (request.decision !== 'PENDING')
        throw new ConflictException('Request already decided');
      const result = await tx.videoDeletionRequest.update({
        where: { id },
        data: {
          decision: 'REJECTED',
          reviewerId: actor.id,
          reviewedAt: new Date(),
          decisionReason: reason,
        },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'VIDEO_DELETION_REJECTED',
        targetType: 'VideoDeletionRequest',
        targetId: id,
        metadata: { reason },
      });
      return result;
    });
  }
  async approve(actor: RequestUser, id: string, reason?: string) {
    assertSuperAdmin(actor);
    const valid = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "VideoDeletionRequest" WHERE id = ${id} FOR UPDATE`;
      const request = await this.request(tx, actor, id);
      if (request.decision !== 'PENDING')
        throw new ConflictException('Request already decided');
      await this.lockOwner(tx, request.contentItemId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-reference:${request.assetId}`}))`;
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${request.assetId} FOR UPDATE`;
      const target = await this.target(tx, request.assetId).catch((error) => {
        if (
          error instanceof NotFoundException ||
          error instanceof ConflictException
        )
          return null;
        throw error;
      });
      const snapshot = request.snapshot as Prisma.JsonObject;
      if (
        !target ||
        target.owner.id !== request.contentItemId ||
        target.courseId !== request.courseId ||
        target.asset.video!.bunnyVideoId !== snapshot.bunnyVideoId ||
        (snapshot.unfinishedUpload === false &&
          target.asset.primaryFor.length === 0)
      ) {
        await tx.videoDeletionRequest.update({
          where: { id },
          data: {
            decision: 'REJECTED',
            reviewerId: actor.id,
            reviewedAt: new Date(),
            decisionReason: 'Video target changed; submit a fresh request',
          },
        });
        await this.audit.recordWithClient(tx, {
          actorUserId: actor.id,
          action: 'VIDEO_DELETION_TARGET_CHANGED',
          targetType: 'VideoDeletionRequest',
          targetId: id,
        });
        return false;
      }
      await tx.asset.update({
        where: { id: request.assetId },
        data: { deletionStartedAt: new Date() },
      });
      await tx.videoDeletionRequest.update({
        where: { id },
        data: {
          decision: 'APPROVED',
          execution: 'IN_PROGRESS',
          reviewerId: actor.id,
          reviewedAt: new Date(),
          decisionReason: reason,
          startedAt: new Date(),
        },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'VIDEO_DELETION_APPROVED',
        targetType: 'VideoDeletionRequest',
        targetId: id,
        metadata: {
          affectedReferences: await this.references(tx, request.assetId),
        },
      });
      return true;
    });
    if (!valid)
      throw new ConflictException(
        'Video target changed; submit a fresh request',
      );
    return this.execute(actor, id);
  }
  private async lockOwner(tx: Prisma.TransactionClient, contentItemId: string) {
    // Writers lock their item/placement row before their triggers lock assets.
    // Follow that order before validating or cleaning up the saved target.
    await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id = ${contentItemId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "contentItemId" FROM "ContentPlacement" WHERE "contentItemId" = ${contentItemId} FOR UPDATE`;
  }
  async retry(actor: RequestUser, id: string) {
    assertSuperAdmin(actor);
    const request = await this.request(this.prisma, actor, id);
    if (
      request.decision !== 'APPROVED' ||
      !['FAILED', 'IN_PROGRESS'].includes(request.execution)
    )
      throw new ConflictException(
        'Only interrupted or failed approved requests can be retried',
      );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_DELETION_RETRIED',
      targetType: 'VideoDeletionRequest',
      targetId: id,
    });
    return this.execute(actor, id);
  }
  private async cleanup(
    tx: Prisma.TransactionClient,
    request: VideoDeletionRequest,
  ) {
    await tx.$executeRaw`SELECT set_config('edu.video_deletion_cleanup', 'on', true)`;
    const assetId = request.assetId;
    // The owner lock also serializes new upload bindings. Keep the draft while
    // another upload needs it for teacher access, attachment or deletion.
    const otherUpload = await tx.asset.findFirst({
      where: {
        uploadContentItemId: request.contentItemId,
        id: { not: assetId },
      },
      select: { id: true },
    });
    if (!otherUpload) {
      await tx.contentItem.deleteMany({ where: { id: request.contentItemId } });
    } else {
      // A retained owner must not stay published without its primary video.
      await tx.contentItem.updateMany({
        where: { id: request.contentItemId },
        data: { status: 'DRAFT', publishedAt: null, archivedAt: null },
      });
    }
    await tx.contentItem.updateMany({
      where: { primaryAssetId: assetId },
      data: { primaryAssetId: null },
    });
    await tx.assetReference.deleteMany({ where: { assetId } });
    await tx.questionVideoLink.deleteMany({ where: { videoAssetId: assetId } });
    await tx.assessmentQuestion.updateMany({
      where: { videoAssetId: assetId },
      data: {
        videoAssetId: null,
        videoAssetName: null,
        timestampSeconds: null,
      },
    });
    await tx.questionAsset.deleteMany({ where: { assetId } });
    await tx.assessmentQuestionAsset.deleteMany({ where: { assetId } });
    await tx.questionContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
    await tx.questionOptionContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
    await tx.questionContextContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
    await tx.assessmentQuestionContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
    await tx.assessmentQuestionOptionContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
    await tx.assessmentContextContentBlock.updateMany({
      where: { assetId },
      data: { assetId: null },
    });
  }
  private async execute(actor: RequestUser, id: string) {
    let acquired = false;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<
            { acquired: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(hashtext(${`video-deletion:${id}`})) AS acquired`;
          if (!lock.acquired)
            throw new ConflictException(
              'Deletion execution is already running',
            );
          acquired = true;
          const request = await this.request(tx, actor, id);
          if (request.execution === 'COMPLETED') return request;
          if (request.decision !== 'APPROVED')
            throw new ConflictException('Request is not approved');
          await this.lockOwner(tx, request.contentItemId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-reference:${request.assetId}`}))`;
          await tx.videoDeletionRequest.update({
            where: { id },
            data: { execution: 'IN_PROGRESS', failureDetails: null },
          });
          await this.cleanup(tx, request);
          const snapshot = request.snapshot as Prisma.JsonObject;
          const response = await fetch(
            `https://video.bunnycdn.com/library/${snapshot.libraryId}/videos/${snapshot.bunnyVideoId}`,
            {
              method: 'DELETE',
              signal: AbortSignal.timeout(15_000),
              headers: { AccessKey: this.stream.apiKey },
            },
          );
          if (!response.ok && response.status !== 404)
            throw new BadRequestException(
              `Bunny deletion failed (${response.status})`,
            );
          await tx.asset.deleteMany({ where: { id: request.assetId } });
          const result = await tx.videoDeletionRequest.update({
            where: { id },
            data: {
              execution: 'COMPLETED',
              completedAt: new Date(),
              failureDetails: null,
              attempts: { increment: 1 },
            },
          });
          await this.audit.recordWithClient(tx, {
            actorUserId: actor.id,
            action: 'VIDEO_DELETION_COMPLETED',
            targetType: 'VideoDeletionRequest',
            targetId: id,
          });
          return result;
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (!acquired) throw error;
      const failureDetails =
        error instanceof Error ? error.message : 'Deletion execution failed';
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`video-deletion:${id}`}))`;
        const current = await tx.videoDeletionRequest.findUnique({
          where: { id },
        });
        if (current?.execution === 'COMPLETED') return;
        await tx.videoDeletionRequest.update({
          where: { id },
          data: {
            execution: 'FAILED',
            failureDetails,
            attempts: { increment: 1 },
          },
        });
        await this.audit.recordWithClient(tx, {
          actorUserId: actor.id,
          action: 'VIDEO_DELETION_FAILED',
          targetType: 'VideoDeletionRequest',
          targetId: id,
          metadata: { failureDetails },
        });
      });
      return this.get(actor, id);
    }
  }
}
