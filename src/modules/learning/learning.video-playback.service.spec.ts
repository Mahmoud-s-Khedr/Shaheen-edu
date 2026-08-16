import { NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service';

describe('LearningService video playback access', () => {
  function build() {
    const prisma: any = {
      contentItem: { findMany: jest.fn().mockResolvedValue([]) },
      studentProfile: { findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }) },
      question: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = { assertContentItemAccess: jest.fn() };
    const assets = {
      getReady: jest.fn().mockResolvedValue({ id: 'video-1', kind: 'VIDEO' }),
    };
    const videos = {
      playback: jest.fn().mockResolvedValue({
        embedUrl: 'https://player.example.test/video-1',
        expiresAt: new Date(),
      }),
    };
    const assessments = { assertSnapshotVideoAccess: jest.fn() };
    return {
      service: new LearningService(
        prisma,
        access as any,
        assets as any,
        videos as any,
        {} as any,
        assessments as any,
      ),
      prisma,
      access,
      videos,
      assessments,
    };
  }

  it('plays a video attached to accessible content', async () => {
    const { service, prisma, access, videos } = build();
    prisma.contentItem.findMany.mockResolvedValue([{ id: 'content-1' }]);
    await expect(
      service.videoPlaybackAccess('student-1', 'video-1'),
    ).resolves.toMatchObject({ embedUrl: expect.any(String) });
    expect(access.assertContentItemAccess).toHaveBeenCalledWith(
      'content-1',
      'student-1',
    );
    expect(videos.playback).toHaveBeenCalledWith('video-1');
  });

  it('plays a video retained by an accessible assessment snapshot', async () => {
    const { service, assessments, videos } = build();
    await expect(
      service.videoPlaybackAccess('student-1', 'video-1'),
    ).resolves.toMatchObject({ embedUrl: expect.any(String) });
    expect(assessments.assertSnapshotVideoAccess).toHaveBeenCalledWith(
      'student-1',
      'video-1',
    );
    expect(videos.playback).toHaveBeenCalledWith('video-1');
  });

  it('does not issue playback for a video with no accessible relationship', async () => {
    const { service, assessments, videos } = build();
    assessments.assertSnapshotVideoAccess.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      service.videoPlaybackAccess('student-1', 'video-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(videos.playback).not.toHaveBeenCalled();
  });

  it('checks only questions linked to the requested video', async () => {
    const { service, prisma, assessments, videos } = build();
    prisma.question.findMany.mockResolvedValue([{ id: 'question-1', placements: [{ course: { id: 'course-1' } }] }]);
    jest.spyOn(service as any, 'questionAccessible').mockResolvedValue(true);

    await service.videoPlaybackAccess('student-1', 'video-1');

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          videoLink: { is: { videoAssetId: 'video-1' } },
        }),
      }),
    );
    expect(assessments.assertSnapshotVideoAccess).not.toHaveBeenCalled();
    expect(videos.playback).toHaveBeenCalledWith('video-1');
  });
});
