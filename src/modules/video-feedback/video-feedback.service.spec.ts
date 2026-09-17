import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AssetStatus,
  ContentStatus,
  Role,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import { VideoFeedbackService } from './video-feedback.service';
import { UpsertVideoFeedbackDto } from './dto/video-feedback.dto';

describe('VideoFeedbackService', () => {
  function build() {
    const prisma: any = {
      videoAsset: {
        findUnique: jest.fn().mockResolvedValue({
          assetId: 'video-1',
          processingStatus: VideoProcessingStatus.READY,
          asset: { status: AssetStatus.READY },
        }),
      },
      contentItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'content-1' }),
      },
      videoFeedback: {
        upsert: jest.fn().mockResolvedValue({
          id: 'feedback-1',
          videoAssetId: 'video-1',
          studentUserId: 'student-1',
          comment: 'Great lesson',
          rating: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
    };
    const access = { assertContentItemAccess: jest.fn().mockResolvedValue({}) };
    return {
      service: new VideoFeedbackService(prisma, access as any),
      prisma,
      access,
    };
  }

  it('creates then updates one feedback row per student and video', async () => {
    const { service, prisma, access } = build();
    await service.upsert('student-1', 'video-1', {
      comment: 'Great lesson',
      rating: 5,
    });
    expect(access.assertContentItemAccess).toHaveBeenCalledWith(
      'content-1',
      'student-1',
    );
    expect(prisma.videoFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentUserId_videoAssetId: {
            studentUserId: 'student-1',
            videoAssetId: 'video-1',
          },
        },
        create: expect.objectContaining({ rating: 5 }),
        update: expect.objectContaining({ comment: 'Great lesson' }),
      }),
    );
  });

  it('allows feedback containing only a rating or only a comment', async () => {
    const { service, prisma } = build();
    await service.upsert('student-1', 'video-1', { rating: 4 });
    await service.upsert('student-1', 'video-1', { comment: 'Clear lesson' });

    expect(prisma.videoFeedback.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({ comment: null, rating: 4 }),
        update: { comment: null, rating: 4 },
      }),
    );
    expect(prisma.videoFeedback.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({ comment: 'Clear lesson', rating: null }),
        update: { comment: 'Clear lesson', rating: null },
      }),
    );
  });

  it('does not create feedback when the student cannot access the published owner', async () => {
    const { service, prisma, access } = build();
    access.assertContentItemAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      service.upsert('student-1', 'video-1', {
        comment: 'No access',
        rating: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.videoFeedback.upsert).not.toHaveBeenCalled();
  });

  it('filters the admin list by video owner, student, rating, and Cairo date range', async () => {
    const { service, prisma } = build();
    await service.list(
      { id: 'admin-1', role: Role.ADMIN, sessionId: 'session-1' },
      {
        page: 1,
        limit: 20,
        videoAssetId: 'video-1',
        contentItemId: 'content-1',
        studentId: 'student-1',
        rating: 4,
        from: '2026-09-01',
        to: '2026-09-02',
      },
    );
    expect(prisma.videoFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          videoAssetId: 'video-1',
          studentUserId: 'student-1',
          rating: 4,
          videoAsset: { asset: { primaryFor: { some: { id: 'content-1' } } } },
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it('requires a ready video with a published primary content owner', async () => {
    const { service, prisma } = build();
    prisma.videoAsset.findUnique.mockResolvedValueOnce({
      assetId: 'video-1',
      processingStatus: VideoProcessingStatus.PROCESSING,
      asset: { status: AssetStatus.READY },
    });
    await expect(
      service.upsert('student-1', 'video-1', { comment: 'Wait', rating: 3 }),
    ).rejects.toThrow('Video is not ready');
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])(
    'permanently deletes feedback for %s',
    async (role) => {
      const { service, prisma } = build();
      await expect(
        service.remove(
          { id: 'admin-1', role, sessionId: 'session-1' },
          'feedback-1',
        ),
      ).resolves.toEqual({ id: 'feedback-1', deleted: true });
      expect(prisma.videoFeedback.deleteMany).toHaveBeenCalledWith({
        where: { id: 'feedback-1' },
      });
    },
  );

  it('returns 404 for missing or already-deleted feedback', async () => {
    const { service, prisma } = build();
    prisma.videoFeedback.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.remove(
        { id: 'admin-1', role: Role.ADMIN, sessionId: 'session-1' },
        'missing-feedback',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects feedback deletion by non-admin roles', async () => {
    const { service, prisma } = build();
    await expect(
      service.remove(
        { id: 'student-1', role: Role.STUDENT, sessionId: 'session-1' },
        'feedback-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.videoFeedback.deleteMany).not.toHaveBeenCalled();
  });

  it('requires either a comment or rating and validates supplied fields', async () => {
    await expect(
      validate(
        plainToInstance(UpsertVideoFeedbackDto, { comment: 'Fine', rating: 0 }),
      ),
    ).resolves.toHaveLength(1);
    await expect(
      validate(
        plainToInstance(UpsertVideoFeedbackDto, { comment: 'Fine', rating: 3 }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpsertVideoFeedbackDto, { comment: 'Fine' })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpsertVideoFeedbackDto, { rating: 3 })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpsertVideoFeedbackDto, {})),
    ).resolves.toHaveLength(1);
  });
});
