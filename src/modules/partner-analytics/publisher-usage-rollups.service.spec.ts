import { PublisherUsageRollupsService } from './publisher-usage-rollups.service';

describe('PublisherUsageRollupsService', () => {
  function build() {
    const tx = {
      $executeRaw: jest.fn(),
      publisherUsageDailySolver: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      publisherUsageDailyRollup: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      assessmentAttempt: { findMany: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    return {
      prisma,
      tx,
      service: new PublisherUsageRollupsService(prisma as any),
    };
  }

  it('rebuilds exact daily aggregate metrics from frozen attribution and stores only solver fingerprints', async () => {
    const { prisma, tx, service } = build();
    const first = {
      id: 'attempt-1',
      studentUserId: 'student-1',
      startedAt: new Date('2026-08-01T10:00:00.000Z'),
      lastActivityAt: new Date('2026-08-01T10:05:00.000Z'),
      assessment: {
        questions: [
          {
            id: 'snapshot-1',
            sourceQuestionId: 'question-1',
            placements: [
              {
                subjectId: 'subject-1',
                courseId: 'course-1',
                chapterId: null,
                lessonId: null,
                sectionId: null,
              },
            ],
            attributions: [
              {
                publisherUserId: 'publisher-1',
                sourceId: 'source-1',
                sourceTitle: 'Publisher source',
              },
            ],
          },
        ],
      },
      answers: [
        {
          assessmentQuestionId: 'snapshot-1',
          isCorrect: true,
          gradedAt: new Date(),
          updatedAt: new Date('2026-08-01T10:05:00.000Z'),
        },
      ],
    };
    const retry = {
      ...first,
      id: 'attempt-2',
      startedAt: new Date('2026-08-01T11:00:00.000Z'),
      lastActivityAt: new Date('2026-08-01T11:02:00.000Z'),
      answers: [
        {
          assessmentQuestionId: 'snapshot-1',
          isCorrect: false,
          gradedAt: new Date(),
          updatedAt: new Date('2026-08-01T11:02:00.000Z'),
        },
      ],
    };
    prisma.assessmentAttempt.findMany.mockResolvedValue([first, retry]);

    await expect(
      service.rebuild({ from: '2026-08-01', to: '2026-08-01' }),
    ).resolves.toEqual(expect.objectContaining({ rows: 3 }));

    const rollups =
      tx.publisherUsageDailyRollup.createMany.mock.calls[0][0].data;
    expect(rollups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'ALL',
          sourceKey: 'source-1',
          presented: 2,
          solved: 2,
          uniqueSolvers: 1,
          graded: 2,
          correct: 1,
          reattempts: 1,
        }),
        expect.objectContaining({ scope: 'SUBJECT', scopeId: 'subject-1' }),
        expect.objectContaining({ scope: 'COURSE', scopeId: 'course-1' }),
      ]),
    );
    const solverRows =
      tx.publisherUsageDailySolver.createMany.mock.calls[0][0].data;
    expect(solverRows).toHaveLength(3);
    expect(JSON.stringify(solverRows)).not.toContain('student-1');
    expect(solverRows[0].studentFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
