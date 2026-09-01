import { LedgerPublisherEarningsService } from './ledger-publisher-earnings.service';

describe('LedgerPublisherEarningsService', () => {
  it('counts a compensating negative row once and excludes its reversed original from financial totals', async () => {
    const prisma: any = {
      partnerAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            state: 'REVERSED',
            amountMinor: 2500,
            currency: 'EGP',
            createdAt: new Date('2026-08-10T10:00:00.000Z'),
            publisherAgreement: {
              id: 'agreement-1',
              version: 1,
              contractReference: null,
              courseId: 'course-1',
              chapterId: null,
              lessonId: null,
            },
            orderItem: {
              courseId: 'course-1',
              chapterId: null,
              titleSnapshot: 'Course',
            },
            settlementLines: [],
          },
          {
            state: 'PAYABLE',
            amountMinor: -2500,
            currency: 'EGP',
            createdAt: new Date('2026-08-12T10:00:00.000Z'),
            publisherAgreement: {
              id: 'agreement-1',
              version: 1,
              contractReference: null,
              courseId: 'course-1',
              chapterId: null,
              lessonId: null,
            },
            orderItem: {
              courseId: 'course-1',
              chapterId: null,
              titleSnapshot: 'Course',
            },
            settlementLines: [],
          },
        ]),
      },
    };
    const service = new LedgerPublisherEarningsService(prisma);
    const report = await service.report(
      'publisher-1',
      {
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
      },
      'day',
    );
    expect(report.totals).toMatchObject({
      earned: { amountMinor: 0 },
      reversals: { amountMinor: 2500 },
      net: { amountMinor: -2500 },
      payable: { amountMinor: -2500 },
    });
  });
});
