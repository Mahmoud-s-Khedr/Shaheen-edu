import { LeaderboardService } from './leaderboard.service';

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

  it('uses the raw correct-and-total-question Smart Score blend with deterministic ranks', async () => {
    const prisma: any = {
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentUserId: 'student-b',
            totalQuestions: 10,
            student: {
              userId: 'student-b',
              academicGradeId: 'grade-1',
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

    const rows = await (service as any).rows(
      {
        key: '2026-08-07',
        startsAt: new Date('2026-08-06T21:00:00Z'),
        endsAt: new Date('2026-08-13T21:00:00Z'),
      },
      'grade-1',
    );

    expect(rows[0]).toMatchObject({
      studentUserId: 'student-a',
      rank: 1,
      smartScore: 4.6,
      accuracyPercent: 50,
    });
    expect(rows[1]).toMatchObject({
      studentUserId: 'student-b',
      rank: 2,
      smartScore: 4.6,
      accuracyPercent: 100,
    });
  });

  it('locks the week before creating a snapshot so a second finalizer is a no-op', async () => {
    const tx: any = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ finalizedAt: null }])
        .mockResolvedValueOnce([{ finalizedAt: new Date() }]),
      studentProfile: {
        findMany: jest.fn().mockResolvedValue([{ academicGradeId: 'grade-1' }]),
      },
      assessmentAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      leaderboardEntry: { create: jest.fn() },
      leaderboardAward: { create: jest.fn() },
      leaderboardWeek: { update: jest.fn() },
    };
    const prisma: any = {
      leaderboardWeek: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'week-1', finalizedAt: null }),
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
    expect(tx.studentProfile.findMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentAttempt.findMany).toHaveBeenCalledTimes(1);
    expect(tx.leaderboardWeek.update).toHaveBeenCalledTimes(1);
  });
});
