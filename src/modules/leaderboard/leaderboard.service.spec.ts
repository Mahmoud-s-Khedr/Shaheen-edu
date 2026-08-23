import { LeaderboardService } from './leaderboard.service';
import { AssessmentQuestionOutcome } from '@prisma/client';

describe('LeaderboardService', () => {
  it('uses Cairo calendar weeks across the DST-start Friday', () => {
    const service = new LeaderboardService({} as any);

    const week = service.weekFor(new Date('2026-04-23T22:00:00.000Z'));

    expect(week).toMatchObject({ key: '2026-04-24' });
    expect(week.startsAt.toISOString()).toBe('2026-04-23T22:00:00.000Z');
    expect(week.endsAt.toISOString()).toBe('2026-04-30T21:00:00.000Z');
  });

  it('keeps Cairo week boundaries calendar-based after DST ends', () => {
    const service = new LeaderboardService({} as any);

    const week = service.weekFor(new Date('2026-10-29T22:00:00.000Z'));

    expect(week).toMatchObject({ key: '2026-10-30' });
    expect(week.startsAt.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    expect(week.endsAt.toISOString()).toBe('2026-11-05T22:00:00.000Z');
  });

  it('uses the PDF Smart Score formula across all student grades', async () => {
    const prisma: any = {
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentUserId: 'student-b',
            totalQuestions: 10,
            student: {
              userId: 'student-b',
              academicGradeId: 'grade-2',
              fullName: 'Basma Noor',
            },
            answers: [{ outcome: 'CORRECT' }, { outcome: 'OMITTED' }],
          },
          {
            studentUserId: 'student-a',
            totalQuestions: 10,
            student: {
              userId: 'student-a',
              academicGradeId: 'grade-1',
              fullName: 'Ali Salem',
            },
            answers: [{ outcome: 'CORRECT' }, { outcome: 'INCORRECT' }],
          },
        ]),
      },
    };
    const service = new LeaderboardService(prisma);

    const rows = await (service as any).rows({
      key: '2026-08-07',
      startsAt: new Date('2026-08-06T21:00:00Z'),
      endsAt: new Date('2026-08-13T21:00:00Z'),
    });

    expect(rows[0]).toMatchObject({
      studentUserId: 'student-b',
      rank: 1,
      smartScore: 64,
      accuracyPercent: 100,
    });
    expect(rows[1]).toMatchObject({
      studentUserId: 'student-a',
      rank: 2,
      smartScore: 34,
      accuracyPercent: 50,
    });
    expect(prisma.assessmentAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          answers: expect.objectContaining({
            none: expect.objectContaining({
              outcome: expect.objectContaining({
                in: expect.arrayContaining([
                  AssessmentQuestionOutcome.PENDING_GRADING,
                  AssessmentQuestionOutcome.PENDING_AI_GRADING,
                ]),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('uses unrounded accuracy for the score but rounds only the displayed percentage', async () => {
    const prisma: any = {
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentUserId: 'student-a',
            totalQuestions: 10,
            student: {
              userId: 'student-a',
              academicGradeId: 'grade-1',
              fullName: 'Ali Salem',
            },
            answers: [
              { outcome: 'CORRECT' },
              { outcome: 'INCORRECT' },
              { outcome: 'INCORRECT' },
            ],
          },
        ]),
      },
    };
    const service = new LeaderboardService(prisma);

    const [row] = await (service as any).rows({
      key: '2026-08-07',
      startsAt: new Date('2026-08-06T21:00:00Z'),
      endsAt: new Date('2026-08-13T21:00:00Z'),
    });

    expect(row.accuracyPercent).toBe(33.3);
    expect(row.smartScore).toBeCloseTo(24, 10);
  });

  it('gives a zero-accuracy student the PDF volume component and keeps exact ties stable', async () => {
    const prisma: any = {
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentUserId: 'student-z',
            totalQuestions: 10,
            student: {
              userId: 'student-z',
              academicGradeId: 'grade-1',
              fullName: 'Ziad Salem',
            },
            answers: [{ outcome: 'OMITTED' }],
          },
          {
            studentUserId: 'student-b',
            totalQuestions: 10,
            student: {
              userId: 'student-b',
              academicGradeId: 'grade-2',
              fullName: 'Basma Noor',
            },
            answers: [{ outcome: 'CORRECT' }, { outcome: 'INCORRECT' }],
          },
          {
            studentUserId: 'student-a',
            totalQuestions: 10,
            student: {
              userId: 'student-a',
              academicGradeId: 'grade-3',
              fullName: 'Ali Salem',
            },
            answers: [{ outcome: 'CORRECT' }, { outcome: 'INCORRECT' }],
          },
        ]),
      },
    };
    const service = new LeaderboardService(prisma);

    const rows = await (service as any).rows({
      key: '2026-08-07',
      startsAt: new Date('2026-08-06T21:00:00Z'),
      endsAt: new Date('2026-08-13T21:00:00Z'),
    });

    expect(rows.map((row: any) => row.studentUserId)).toEqual([
      'student-a',
      'student-b',
      'student-z',
    ]);
    expect(rows[2]).toMatchObject({ accuracyPercent: 0, smartScore: 4 });
  });

  it('shows the top-three medal labels on a live leaderboard row', () => {
    const service = new LeaderboardService({} as any);

    expect((service as any).entryDto({ rank: 1 })).toMatchObject({
      award: { tier: 'GOLD', label: 'Gold Medal' },
    });
  });

  it('returns platform-wide history', async () => {
    const entries = [
      {
        rank: 1,
        studentUserId: 'student-a',
        academicGradeId: 'grade-1',
        displayName: 'Ali S.',
      },
      {
        rank: 1,
        studentUserId: 'student-b',
        academicGradeId: 'grade-2',
        displayName: 'Basma N.',
      },
    ];
    const prisma: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'student-a' }),
      },
      leaderboardWeek: {
        findUnique: jest.fn().mockResolvedValue({
          weekKey: '2026-08-07',
          startsAt: new Date(),
          endsAt: new Date(),
          finalizedAt: new Date(),
          entries,
        }),
      },
    };
    const service = new LeaderboardService(prisma);

    const history = await service.history('student-a', '2026-08-07', {} as any);

    expect(history.data).toHaveLength(2);
    expect(history.meta.total).toBe(2);
  });

  it('locks the week before creating a snapshot so a second finalizer is a no-op', async () => {
    const tx: any = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ finalizedAt: null }])
        .mockResolvedValueOnce([{ finalizedAt: new Date() }]),
      assessmentAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      leaderboardEntry: { create: jest.fn() },
      leaderboardAward: { create: jest.fn() },
      leaderboardWeek: { update: jest.fn() },
    };
    const prisma: any = {
      leaderboardWeek: {
        upsert: jest.fn().mockResolvedValue({
          id: 'week-1',
          finalizedAt: null,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new LeaderboardService(prisma);
    const week = {
      key: '2026-08-07',
      startsAt: new Date('2026-08-06T21:00:00.000Z'),
      endsAt: new Date('2026-08-13T21:00:00.000Z'),
    };

    await service.finalize(week);
    await service.finalize(week);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.assessmentAttempt.findMany).toHaveBeenCalledTimes(1);
    expect(tx.leaderboardWeek.update).toHaveBeenCalledTimes(1);
    expect(prisma.leaderboardWeek.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ weekKey: week.key }),
      }),
    );
  });
});
