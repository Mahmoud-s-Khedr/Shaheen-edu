import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LearningService } from './learning.service';

describe('LearningService daily activity', () => {
  it('uses Cairo days, de-duplicates correct retries, omits missing duration, and fills zero days', async () => {
    const prisma: any = {
      studentQuestionAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            questionId: 'q-1',
            submittedAt: new Date('2026-09-15T21:30:00.000Z'),
          }, // Sep 16 Cairo
          {
            questionId: 'q-1',
            submittedAt: new Date('2026-09-16T08:00:00.000Z'),
          }, // retry
          {
            questionId: 'q-2',
            submittedAt: new Date('2026-09-16T21:30:00.000Z'),
          }, // Sep 17 Cairo
        ]),
      },
      studentContentProgress: {
        findMany: jest.fn().mockResolvedValue([
          {
            completedAt: new Date('2026-09-16T20:30:00.000Z'),
            contentItem: { estimatedDuration: 120 },
          }, // Sep 16
          {
            completedAt: new Date('2026-09-17T02:00:00.000Z'),
            contentItem: { estimatedDuration: null },
          },
        ]),
      },
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'selected-child-1',
          fullName: 'Selected Child',
          parentPhoneNormalized: '+201000000000',
        }),
      },
      $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
    };
    const service = new LearningService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.dailyActivity('student-1', '2026-09-16', '2026-09-18'),
    ).resolves.toEqual({
      days: [
        { date: '2026-09-16', solvedQuestions: 1, contentDurationSeconds: 120 },
        { date: '2026-09-17', solvedQuestions: 1, contentDurationSeconds: 0 },
        { date: '2026-09-18', solvedQuestions: 0, contentDurationSeconds: 0 },
      ],
    });
    expect(prisma.studentQuestionAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentUserId: 'student-1',
          isCorrect: true,
        }),
      }),
    );
  });

  it('derives activity only from the selected child in the parent session', async () => {
    const prisma: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'selected-child-1',
          fullName: 'Selected Child',
          parentPhoneNormalized: '+201000000000',
        }),
      },
      studentQuestionAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      studentContentProgress: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
    };
    const service = new LearningService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.parentDailyActivity(
        {
          id: 'parent-session-1',
          activeStudentId: 'selected-child-1',
          parentPhoneNormalized: '+201000000000',
        },
        '2026-09-16',
        '2026-09-16',
      ),
    ).resolves.toEqual({
      days: [
        {
          date: '2026-09-16',
          solvedQuestions: 0,
          contentDurationSeconds: 0,
        },
      ],
    });
    expect(prisma.studentQuestionAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentUserId: 'selected-child-1' }),
      }),
    );
  });

  it('rejects invalid or reversed Cairo calendar ranges', async () => {
    const service = new LearningService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.dailyActivity('student-1', '2026-09-18', '2026-09-16'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.dailyActivity('student-1', '2026-09-16T00:00:00', '2026-09-16'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a selected child that is not linked to the parent session', async () => {
    const service = new LearningService(
      {
        studentProfile: {
          findUnique: jest.fn().mockResolvedValue({
            userId: 'selected-child-1',
            fullName: 'Other Parent Child',
            parentPhoneNormalized: '+201111111111',
          }),
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.parentDailyActivity(
        {
          id: 'parent-session-1',
          activeStudentId: 'selected-child-1',
          parentPhoneNormalized: '+201000000000',
        },
        '2026-09-16',
        '2026-09-16',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
