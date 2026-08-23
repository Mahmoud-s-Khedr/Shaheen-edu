import { PartnerType } from '../../common/types/roles.enum';
import { PartnerAnalyticsService } from './partner-analytics.service';

describe('PartnerAnalyticsService publisher usage', () => {
  it('uses aggregate rollups for a long range and returns no learner identity', async () => {
    const prisma: any = {
      partnerProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ partnerType: PartnerType.CONTENT_PUBLISHER }),
      },
      publisherUsageDailyRollup: {
        findMany: jest.fn().mockResolvedValue([
          {
            usageDate: new Date('2026-01-01T00:00:00.000Z'),
            sourceKey: 'source-1',
            sourceTitle: 'Source',
            presented: 4,
            solved: 2,
            correct: 1,
            graded: 2,
            reattempts: 1,
            calculatedAt: new Date('2026-05-01T00:00:00.000Z'),
          },
          {
            usageDate: new Date('2026-02-01T00:00:00.000Z'),
            sourceKey: 'source-1',
            sourceTitle: 'Source',
            presented: 6,
            solved: 0,
            correct: 0,
            graded: 0,
            reattempts: 0,
            calculatedAt: new Date('2026-05-01T00:00:00.000Z'),
          },
        ]),
      },
      publisherUsageDailySolver: {
        findMany: jest.fn().mockResolvedValue([
          {
            usageDate: new Date('2026-01-01T00:00:00.000Z'),
            sourceKey: 'source-1',
            studentFingerprint: 'fingerprint-a',
          },
          {
            usageDate: new Date('2026-02-01T00:00:00.000Z'),
            sourceKey: 'source-1',
            studentFingerprint: 'fingerprint-a',
          },
          {
            usageDate: new Date('2026-02-01T00:00:00.000Z'),
            sourceKey: 'source-1',
            studentFingerprint: 'fingerprint-b',
          },
        ]),
      },
      question: { count: jest.fn().mockResolvedValue(12) },
      assessmentAttempt: { findMany: jest.fn() },
    };
    const ledger = {
      report: jest
        .fn()
        .mockResolvedValue({ totals: { net: { amountMinor: 500 } } }),
    };
    const service = new PartnerAnalyticsService(prisma, ledger as any);

    const result = await service.questionUsage('publisher-1', {
      from: '2026-01-01',
      to: '2026-05-01',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({
        rolledUp: true,
        presented: 10,
        solved: 2,
        uniqueSolvers: 2,
        trend: expect.arrayContaining([
          expect.objectContaining({
            period: '2026-01',
            presented: 4,
            solved: 2,
          }),
          expect.objectContaining({
            period: '2026-02',
            presented: 6,
            solved: 0,
          }),
        ]),
        indicators: expect.objectContaining({
          zeroUsage: false,
          zeroSolved: false,
        }),
      }),
    );
    expect(prisma.assessmentAttempt.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('fingerprint-');
  });

  it('identifies ledger earnings despite zero solved questions', async () => {
    const prisma: any = {
      partnerProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ partnerType: PartnerType.CONTENT_PUBLISHER }),
      },
      publisherUsageDailyRollup: { findMany: jest.fn().mockResolvedValue([]) },
      publisherUsageDailySolver: { findMany: jest.fn().mockResolvedValue([]) },
      question: { count: jest.fn().mockResolvedValue(4) },
    };
    const service = new PartnerAnalyticsService(prisma, {
      report: jest
        .fn()
        .mockResolvedValue({ totals: { net: { amountMinor: 1 } } }),
    } as any);

    const result = await service.questionUsage('publisher-1', {
      from: '2026-01-01',
      to: '2026-05-01',
      page: 1,
      limit: 20,
    });

    expect(result.indicators).toEqual(
      expect.objectContaining({
        zeroUsage: true,
        zeroSolved: true,
        earningsDespiteZeroSolved: true,
      }),
    );
  });

  it('returns a raw daily trend for an on-demand range', async () => {
    const prisma: any = {
      partnerProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ partnerType: PartnerType.CONTENT_PUBLISHER }),
      },
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            studentUserId: 'student-1',
            startedAt: new Date('2026-08-01T10:00:00.000Z'),
            assessment: {
              questions: [
                {
                  id: 'snapshot-1',
                  sourceQuestionId: 'question-1',
                  placements: [],
                  attributions: [
                    { sourceId: 'source-1', sourceTitle: 'Source' },
                  ],
                },
              ],
            },
            answers: [
              {
                assessmentQuestionId: 'snapshot-1',
                isCorrect: true,
                gradedAt: new Date(),
              },
            ],
          },
        ]),
      },
      question: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new PartnerAnalyticsService(prisma, {
      report: jest
        .fn()
        .mockResolvedValue({ totals: { net: { amountMinor: 0 } } }),
    } as any);

    const result = await service.questionUsage('publisher-1', {
      from: '2026-08-01',
      to: '2026-08-01',
      page: 1,
      limit: 20,
    });

    expect(result).toEqual(
      expect.objectContaining({
        rolledUp: false,
        trend: [
          expect.objectContaining({
            period: '2026-08-01',
            presented: 1,
            solved: 1,
            uniqueSolvers: 1,
          }),
        ],
      }),
    );
  });
});
