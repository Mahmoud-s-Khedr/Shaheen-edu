/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- jest mock plumbing is untyped by design */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  AssetStatus,
  Role,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { VideosService } from './videos.service';

const admin: RequestUser = { id: 'admin-1', role: Role.ADMIN, sessionId: 's1' };

const streamConfig = {
  libraryId: '123',
  apiKey: 'api-key-secret',
  readOnlyKey: 'read-only-key-secret',
  playerTokenKey: 'player-token-secret',
  uploadTtlSeconds: 10800,
  playbackTtlSeconds: 300,
};

function sign(raw: string): string {
  return createHmac('sha256', streamConfig.readOnlyKey)
    .update(raw, 'utf8')
    .digest('hex');
}

function buildService() {
  const prisma = {
    asset: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    videoAsset: { update: jest.fn(), findUnique: jest.fn() },
    bunnyStreamWebhookEvent: { create: jest.fn().mockResolvedValue(undefined) },
    // Supports both the array form (webhook) and the callback form (retry).
    $transaction: jest.fn().mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg({ videoAsset: prisma.videoAsset, asset: prisma.asset });
      }
      return Promise.all(arg);
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const assets = { isReferenced: jest.fn().mockResolvedValue(false) };
  const config = { get: () => streamConfig };
  const service = new VideosService(
    prisma as never,
    audit as never,
    assets as never,
    config as never,
  );
  return { service, prisma, audit, assets };
}

describe('VideosService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('verifyWebhook', () => {
    it('accepts a correctly signed payload', () => {
      const { service } = buildService();
      const raw = '{"VideoGuid":"v1","Status":3}';
      expect(service.verifyWebhook(raw, sign(raw), 'v1', 'hmac-sha256')).toBe(
        true,
      );
    });

    it('rejects wrong version, algorithm, missing or malformed signatures', () => {
      const { service } = buildService();
      const raw = '{"VideoGuid":"v1","Status":3}';
      const good = sign(raw);
      expect(service.verifyWebhook(raw, good, 'v2', 'hmac-sha256')).toBe(false);
      expect(service.verifyWebhook(raw, good, 'v1', 'md5')).toBe(false);
      expect(service.verifyWebhook(raw, undefined, 'v1', 'hmac-sha256')).toBe(
        false,
      );
      expect(service.verifyWebhook(raw, 'not-hex', 'v1', 'hmac-sha256')).toBe(
        false,
      );
    });

    it('rejects a tampered body', () => {
      const { service } = buildService();
      const raw = '{"VideoGuid":"v1","Status":3}';
      const good = sign(raw);
      expect(
        service.verifyWebhook(
          '{"VideoGuid":"v1","Status":5}',
          good,
          'v1',
          'hmac-sha256',
        ),
      ).toBe(false);
    });
  });

  describe('webhook', () => {
    const foundVideo = {
      assetId: 'a1',
      bunnyVideoId: 'bunny-1',
      processingStatus: VideoProcessingStatus.PROCESSING,
      processingProgress: 20,
      asset: { id: 'a1' },
    };

    it.each([
      [3, VideoProcessingStatus.READY, AssetStatus.READY],
      [5, VideoProcessingStatus.FAILED, AssetStatus.FAILED],
      [1, VideoProcessingStatus.PROCESSING, AssetStatus.PROCESSING],
      [0, VideoProcessingStatus.QUEUED, AssetStatus.PROCESSING],
    ])(
      'maps Bunny status %i to processing/asset state',
      async (status, procStatus, assetStatus) => {
        const { service, prisma } = buildService();
        prisma.videoAsset.findUnique.mockResolvedValue(foundVideo);
        const payload = { VideoGuid: 'bunny-1', Status: status };
        const result = await service.webhook(payload, JSON.stringify(payload));
        expect(result).toEqual({ received: true });
        expect(prisma.videoAsset.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ processingStatus: procStatus }),
          }),
        );
        expect(prisma.asset.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: assetStatus }),
          }),
        );
      },
    );

    it('preserves failure metadata on a failed status', async () => {
      const { service, prisma } = buildService();
      prisma.videoAsset.findUnique.mockResolvedValue(foundVideo);
      const payload = { VideoGuid: 'bunny-1', Status: 8 };
      await service.webhook(payload, JSON.stringify(payload));
      expect(prisma.videoAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failureMetadata: { bunnyStatus: 8 },
          }),
        }),
      );
    });

    it('is idempotent: a duplicate event key short-circuits with no state change', async () => {
      const { service, prisma } = buildService();
      prisma.bunnyStreamWebhookEvent.create.mockRejectedValue(
        new Error('unique clash'),
      );
      const payload = { VideoGuid: 'bunny-1', Status: 3 };
      const result = await service.webhook(payload, JSON.stringify(payload));
      expect(result).toEqual({ received: true, duplicate: true });
      expect(prisma.videoAsset.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignores webhooks for an unknown video', async () => {
      const { service, prisma } = buildService();
      prisma.videoAsset.findUnique.mockResolvedValue(null);
      const payload = { VideoGuid: 'ghost', Status: 3 };
      const result = await service.webhook(payload, JSON.stringify(payload));
      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a state regression away from READY', async () => {
      const { service, prisma } = buildService();
      prisma.videoAsset.findUnique.mockResolvedValue({
        ...foundVideo,
        processingStatus: VideoProcessingStatus.READY,
      });
      const payload = { VideoGuid: 'bunny-1', Status: 1 };
      const result = await service.webhook(payload, JSON.stringify(payload));
      expect(result).toEqual({ received: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a state regression away from FAILED', async () => {
      const { service, prisma } = buildService();
      prisma.videoAsset.findUnique.mockResolvedValue({
        ...foundVideo,
        processingStatus: VideoProcessingStatus.FAILED,
      });
      const payload = { VideoGuid: 'bunny-1', Status: 1 };
      await service.webhook(payload, JSON.stringify(payload));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid payload', async () => {
      const { service } = buildService();
      await expect(
        service.webhook({ Status: 3 } as any, '{}'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('explicit deletion', () => {
    it('deletes an unreferenced Bunny video and records a safe audit event', async () => {
      const { service, prisma, audit, assets } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        video: { bunnyVideoId: 'bunny-1' },
      });
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status: 204 }));
      await expect(service.delete(admin, 'asset-1')).resolves.toEqual({
        id: 'asset-1',
        deleted: true,
      });
      expect(assets.isReferenced).toHaveBeenCalledWith('asset-1');
      expect(prisma.asset.delete).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VIDEO_ASSET_DELETED',
          metadata: { bunnyVideoId: 'bunny-1' },
        }),
      );
    });

    it('refuses deletion before contacting Bunny when the video is referenced', async () => {
      const { service, prisma, assets } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        video: { bunnyVideoId: 'bunny-1' },
      });
      assets.isReferenced.mockResolvedValue(true);
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(service.delete(admin, 'asset-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.asset.delete).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a Bunny video and a PENDING_UPLOAD asset, then audits', async () => {
      const { service, prisma, audit } = buildService();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ guid: 'bunny-new' }), {
          status: 200,
        }),
      );
      prisma.asset.create.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.PENDING_UPLOAD,
        video: { processingStatus: VideoProcessingStatus.CREATED },
      });
      const result = await service.create(admin, 'My Lesson');
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AssetStatus.PENDING_UPLOAD }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VIDEO_ASSET_CREATED' }),
      );
      expect(result).toMatchObject({ id: 'a1' });
    });

    it('fails when Bunny cannot create the video', async () => {
      const { service } = buildService();
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('nope', { status: 500 }));
      await expect(service.create(admin, 'My Lesson')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('authorization', () => {
    it('issues signed upload authorization without exposing secrets', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.PENDING_UPLOAD,
        video: { assetId: 'a1', bunnyVideoId: 'bunny-1' },
      });
      const result = await service.authorization(admin, 'a1');
      expect(result).toMatchObject({
        endpoint: 'https://video.bunnycdn.com/tusupload',
        videoId: 'bunny-1',
        libraryId: streamConfig.libraryId,
      });
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(streamConfig.apiKey);
      expect(serialized).not.toContain(streamConfig.readOnlyKey);
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: AssetStatus.UPLOADING } }),
      );
    });

    it('refuses authorization for an already-ready asset', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.READY,
        video: { assetId: 'a1', bunnyVideoId: 'bunny-1' },
      });
      await expect(service.authorization(admin, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('confirmation', () => {
    it('records client completion after upload authorization', async () => {
      const { service, prisma, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.UPLOADING,
        video: { assetId: 'a1', processingStatus: VideoProcessingStatus.UPLOADING },
      });
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.UPLOADED_AWAITING_PROCESSING,
        video: {
          processingStatus: VideoProcessingStatus.UPLOADING,
          clientUploadCompletedAt: new Date('2026-08-03T12:00:00.000Z'),
        },
      });

      const result = await service.confirmation(admin, 'a1');

      expect(result).toMatchObject({
        status: AssetStatus.UPLOADED_AWAITING_PROCESSING,
        video: { processingStatus: VideoProcessingStatus.UPLOADING },
      });
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssetStatus.UPLOADED_AWAITING_PROCESSING,
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VIDEO_UPLOAD_CONFIRMED_BY_CLIENT' }),
      );
    });

    it('rejects confirmation before an upload has started', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.PENDING_UPLOAD,
        video: { assetId: 'a1' },
      });
      await expect(service.confirmation(admin, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('records a delayed confirmation without regressing Bunny-driven state', async () => {
      const { service, prisma, audit } = buildService();
      const processing = {
        id: 'a1',
        status: AssetStatus.PROCESSING,
        video: {
          assetId: 'a1',
          processingStatus: VideoProcessingStatus.PROCESSING,
          clientUploadCompletedAt: null,
        },
      };
      prisma.asset.findUnique.mockResolvedValue(processing);
      prisma.asset.update.mockResolvedValue({
        ...processing,
        video: {
          ...processing.video,
          clientUploadCompletedAt: new Date('2026-08-05T16:18:21.000Z'),
        },
      });
      await expect(service.confirmation(admin, 'a1')).resolves.toMatchObject({
        status: AssetStatus.PROCESSING,
        video: { processingStatus: VideoProcessingStatus.PROCESSING },
      });
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            video: { update: { clientUploadCompletedAt: expect.any(Date) } },
          },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VIDEO_UPLOAD_CONFIRMED_BY_CLIENT' }),
      );
    });

    it('keeps a previously recorded delayed confirmation idempotent', async () => {
      const { service, prisma, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.PROCESSING,
        video: {
          assetId: 'a1',
          processingStatus: VideoProcessingStatus.QUEUED,
          clientUploadCompletedAt: new Date('2026-08-05T16:18:21.000Z'),
        },
      });
      await expect(service.confirmation(admin, 'a1')).resolves.toMatchObject({
        status: AssetStatus.PROCESSING,
      });
      expect(prisma.asset.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('rejects retrying a non-failed asset', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.READY,
        video: { assetId: 'a1', bunnyVideoId: 'bunny-1' },
      });
      await expect(service.retry(admin, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('creates a fresh Bunny video, increments attempt, and resets state', async () => {
      const { service, prisma, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.FAILED,
        filename: 'video',
        video: { assetId: 'a1', bunnyVideoId: 'bunny-old' },
      });
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ guid: 'bunny-new' }), {
          status: 200,
        }),
      );
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.PENDING_UPLOAD,
        video: { attempt: 2 },
      });
      await service.retry(admin, 'a1');
      expect(prisma.videoAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bunnyVideoId: 'bunny-new',
            attempt: { increment: 1 },
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'VIDEO_ASSET_RETRIED' }),
      );
    });
  });

  describe('playback', () => {
    it('allows only administrators to request an unscoped preview', async () => {
      const { service } = buildService();
      await expect(
        service.adminPlayback(
          { id: 'student-1', role: Role.STUDENT, sessionId: 's1' },
          'a1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses playback until the asset and video are both ready', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.UPLOADING,
        video: {
          assetId: 'a1',
          bunnyVideoId: 'bunny-1',
          processingStatus: VideoProcessingStatus.PROCESSING,
        },
      });
      await expect(service.playback('a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('issues a short-lived embed URL without leaking the player token key', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.READY,
        video: {
          assetId: 'a1',
          bunnyVideoId: 'bunny-1',
          processingStatus: VideoProcessingStatus.READY,
        },
      });
      const result = await service.playback('a1');
      expect(result.embedUrl).toContain('bunny-1');
      expect(result.embedUrl).toContain('token=');
      expect(result.embedUrl).not.toContain(streamConfig.playerTokenKey);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
