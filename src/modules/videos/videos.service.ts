import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AssetKind,
  AssetStatus,
  Role,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../assets/assets.service';

@Injectable()
export class VideosService {
  private static readonly PROVIDER_TIMEOUT_MS = 15_000;
  private readonly config: AppConfig['stream'];
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.config = config.get('stream', { infer: true });
  }
  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private async createBunnyVideo(title: string) {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${this.config.libraryId}/videos`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(VideosService.PROVIDER_TIMEOUT_MS),
        headers: {
          AccessKey: this.config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ title }),
      },
    );
    if (!response.ok)
      throw new BadRequestException('Bunny Stream could not create the video');
    const body = (await response.json()) as { guid?: string };
    if (!body.guid)
      throw new BadRequestException('Bunny Stream returned no video ID');
    return body.guid;
  }

  async create(actor: RequestUser, title: string, filename = 'video') {
    this.assertAdmin(actor);
    if (!title?.trim()) throw new BadRequestException('title is required');
    const bunnyVideoId = await this.createBunnyVideo(title.trim());
    const asset = await this.prisma.asset.create({
      data: {
        provider: 'BUNNY_STREAM',
        kind: AssetKind.VIDEO,
        status: AssetStatus.PENDING_UPLOAD,
        originalFilename: filename,
        filename:
          filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'video',
        mimeType: 'video/*',
        uploadedById: actor.id,
        video: { create: { libraryId: this.config.libraryId, bunnyVideoId } },
      },
      include: { video: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_ASSET_CREATED',
      targetType: 'Asset',
      targetId: asset.id,
    });
    return this.summary(asset);
  }

  async authorization(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    const asset = await this.getWithVideo(assetId);
    if (
      asset.status === AssetStatus.READY ||
      asset.status === AssetStatus.ARCHIVED
    )
      throw new ConflictException(
        'Video cannot be uploaded in its current state',
      );
    const expires =
      Math.floor(Date.now() / 1000) + this.config.uploadTtlSeconds;
    const signature = createHash('sha256')
      .update(
        `${this.config.libraryId}${this.config.apiKey}${expires}${asset.video.bunnyVideoId}`,
      )
      .digest('hex');
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { status: AssetStatus.UPLOADING },
    });
    await this.prisma.videoAsset.update({
      where: { assetId },
      data: { processingStatus: VideoProcessingStatus.UPLOADING },
    });
    return {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      videoId: asset.video.bunnyVideoId,
      libraryId: this.config.libraryId,
      expires,
      signature,
    };
  }

  async confirmation(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    const asset = await this.getWithVideo(assetId);
    if (
      asset.status === AssetStatus.PENDING_UPLOAD ||
      asset.status === AssetStatus.ARCHIVED
    )
      throw new ConflictException('Video upload has not started');

    // Bunny can deliver its first processing webhook before the client reaches
    // this endpoint. Preserve that newer provider state, but still retain the
    // client-completion audit signal.
    if (asset.status !== AssetStatus.UPLOADING) {
      if (asset.video.clientUploadCompletedAt) return this.summary(asset);
      const updated = await this.prisma.asset.update({
        where: { id: assetId },
        data: {
          video: { update: { clientUploadCompletedAt: new Date() } },
        },
        include: { video: true },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'VIDEO_UPLOAD_CONFIRMED_BY_CLIENT',
        targetType: 'Asset',
        targetId: assetId,
      });
      return this.summary(updated);
    }

    const updated = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.UPLOADED_AWAITING_PROCESSING,
        video: { update: { clientUploadCompletedAt: new Date() } },
      },
      include: { video: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_UPLOAD_CONFIRMED_BY_CLIENT',
      targetType: 'Asset',
      targetId: assetId,
    });
    return this.summary(updated);
  }

  async retry(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    const old = await this.getWithVideo(assetId);
    if (old.status !== AssetStatus.FAILED)
      throw new ConflictException('Only failed video assets can be retried');
    const bunnyVideoId = await this.createBunnyVideo(old.filename);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.videoAsset.update({
        where: { assetId },
        data: {
          bunnyVideoId,
          processingStatus: VideoProcessingStatus.CREATED,
          processingProgress: 0,
          failureMetadata: Prisma.JsonNull,
          attempt: { increment: 1 },
          lastWebhookAt: null,
        },
      });
      return tx.asset.update({
        where: { id: assetId },
        data: {
          status: AssetStatus.PENDING_UPLOAD,
          failedAt: null,
          readyAt: null,
          metadata: { previousBunnyVideoId: old.video.bunnyVideoId },
        },
        include: { video: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_ASSET_RETRIED',
      targetType: 'Asset',
      targetId: assetId,
    });
    return this.summary(updated);
  }

  async get(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    return this.summary(await this.getWithVideo(assetId));
  }
  async archive(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    const asset = await this.getWithVideo(assetId);
    if (await this.assets.isReferenced(assetId))
      throw new ConflictException('Referenced video assets cannot be archived');
    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() },
      include: { video: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_ASSET_ARCHIVED',
      targetType: 'Asset',
      targetId: assetId,
    });
    return this.summary(updated);
  }
  async delete(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    const asset = await this.getWithVideo(assetId);
    if (await this.assets.isReferenced(assetId))
      throw new ConflictException('Referenced video assets cannot be deleted');
    const response = await fetch(
      `https://video.bunnycdn.com/library/${this.config.libraryId}/videos/${asset.video.bunnyVideoId}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(VideosService.PROVIDER_TIMEOUT_MS),
        headers: { AccessKey: this.config.apiKey },
      },
    );
    // Bunny returns 404 when an operator already removed the remote object; deleting the
    // local orphan is still safe and makes the operation idempotent for cleanup runbooks.
    if (!response.ok && response.status !== 404)
      throw new BadRequestException('Bunny Stream could not delete the video');
    await this.prisma.asset.delete({ where: { id: assetId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'VIDEO_ASSET_DELETED',
      targetType: 'Asset',
      targetId: assetId,
      metadata: { bunnyVideoId: asset.video.bunnyVideoId },
    });
    return { id: assetId, deleted: true };
  }

  async playback(assetId: string) {
    const asset = await this.getWithVideo(assetId);
    if (
      asset.status !== AssetStatus.READY ||
      asset.video.processingStatus !== VideoProcessingStatus.READY
    )
      throw new ConflictException('Video is not ready');
    const expires =
      Math.floor(Date.now() / 1000) + this.config.playbackTtlSeconds;
    const token = createHash('sha256')
      .update(
        `${this.config.playerTokenKey}${asset.video.bunnyVideoId}${expires}`,
      )
      .digest('hex');
    return {
      embedUrl: `https://iframe.mediadelivery.net/embed/${this.config.libraryId}/${asset.video.bunnyVideoId}?token=${token}&expires=${expires}`,
      expiresAt: new Date(expires * 1000),
    };
  }

  async adminPlayback(actor: RequestUser, assetId: string) {
    this.assertAdmin(actor);
    return this.playback(assetId);
  }

  verifyWebhook(
    raw: string,
    signature: string | undefined,
    version: string | undefined,
    algorithm: string | undefined,
  ) {
    if (
      version !== 'v1' ||
      algorithm !== 'hmac-sha256' ||
      !signature ||
      !/^[0-9a-f]{64}$/.test(signature)
    )
      return false;
    const expected = createHmac('sha256', this.config.readOnlyKey)
      .update(raw, 'utf8')
      .digest('hex');
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
  async webhook(
    payload: {
      VideoGuid?: string;
      Status?: number;
      EncodeProgress?: number;
      Length?: number;
      ThumbnailFileName?: string;
    },
    raw: string,
  ) {
    if (!payload.VideoGuid || typeof payload.Status !== 'number')
      throw new BadRequestException('Invalid Bunny webhook payload');
    const eventKey = createHash('sha256')
      .update(`${payload.VideoGuid}:${payload.Status}:${raw}`)
      .digest('hex');
    const statuses: Record<number, VideoProcessingStatus> = {
      0: VideoProcessingStatus.QUEUED,
      1: VideoProcessingStatus.PROCESSING,
      2: VideoProcessingStatus.PROCESSING,
      3: VideoProcessingStatus.READY,
      5: VideoProcessingStatus.FAILED,
      8: VideoProcessingStatus.FAILED,
    };
    const next = statuses[payload.Status];
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Persisting the delivery and applying its state change are atomic.
        // Otherwise a failure after event insertion makes every retry look
        // duplicate and permanently loses the provider transition.
        await tx.bunnyStreamWebhookEvent.create({
          data: {
            eventKey,
            bunnyVideoId: payload.VideoGuid!,
            status: payload.Status!,
            payload: payload as object,
          },
        });
        const video = await tx.videoAsset.findUnique({
          where: { bunnyVideoId: payload.VideoGuid },
          include: { asset: true },
        });
        if (!video) return { received: true };
        if (
          !next ||
          (video.processingStatus === VideoProcessingStatus.READY &&
            next !== VideoProcessingStatus.READY) ||
          (video.processingStatus === VideoProcessingStatus.FAILED &&
            next !== VideoProcessingStatus.FAILED)
        )
          return { received: true };
        await tx.videoAsset.update({
          where: { assetId: video.assetId },
          data: {
            processingStatus: next,
            processingProgress:
              payload.Status === 3
                ? 100
                : Math.max(
                    video.processingProgress,
                    payload.EncodeProgress ?? 0,
                  ),
            durationSeconds: payload.Length
              ? Math.round(payload.Length)
              : undefined,
            thumbnailUrl: payload.ThumbnailFileName ?? undefined,
            lastWebhookAt: new Date(),
            failureMetadata:
              next === VideoProcessingStatus.FAILED
                ? { bunnyStatus: payload.Status }
                : undefined,
          },
        });
        await tx.asset.update({
          where: { id: video.assetId },
          data:
            next === VideoProcessingStatus.READY
              ? { status: AssetStatus.READY, readyAt: new Date(), failedAt: null }
              : next === VideoProcessingStatus.FAILED
                ? { status: AssetStatus.FAILED, failedAt: new Date() }
                : { status: AssetStatus.PROCESSING },
        });
        return { received: true };
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002')
        return { received: true, duplicate: true };
      throw error;
    }
  }

  private async getWithVideo(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { video: true },
    });
    if (!asset?.video) throw new NotFoundException('Video asset not found');
    return asset as typeof asset & { video: NonNullable<typeof asset.video> };
  }
  private summary(asset: any) {
    return {
      id: asset.id,
      provider: asset.provider,
      kind: asset.kind,
      status: asset.status,
      filename: asset.filename,
      createdAt: asset.createdAt,
      readyAt: asset.readyAt,
      failedAt: asset.failedAt,
      video: {
        processingStatus: asset.video?.processingStatus,
        processingProgress: asset.video?.processingProgress,
        durationSeconds: asset.video?.durationSeconds,
        thumbnailUrl: asset.video?.thumbnailUrl,
        clientUploadCompletedAt: asset.video?.clientUploadCompletedAt,
        attempt: asset.video?.attempt,
      },
    };
  }
}
