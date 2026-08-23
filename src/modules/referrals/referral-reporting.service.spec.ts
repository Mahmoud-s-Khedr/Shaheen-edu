import { ReferralReportingService } from './referral-reporting.service';

const config = { get: jest.fn().mockReturnValue({ referralPartnerMinimumCohort: 3 }) } as any;

function attribution(studentUserId: string, productId: string, subjectId: string) {
  return {
    id: `attr-${studentUserId}-${productId}`,
    studentUserId,
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
    order: {
      status: 'APPROVED', approvedAt: new Date('2026-08-10T10:00:00.000Z'),
      items: [{ priceMinor: 1000, course: { id: productId, title: productId, subject: { id: subjectId, title: subjectId } }, chapter: null }],
    },
  };
}

describe('ReferralReportingService privacy-safe partner reports', () => {
  function build(rows: any[]) {
    const prisma: any = {
      partnerProfile: { findUnique: jest.fn().mockResolvedValue({ partnerType: 'REFERRAL_PARTNER' }) },
      orderReferralAttribution: { findMany: jest.fn().mockResolvedValue(rows) },
      partnerAllocation: { groupBy: jest.fn().mockResolvedValue([{ state: 'PAYABLE', currency: 'EGP', _count: 3, _sum: { amountMinor: 300, basisMinor: 3000 } }]) },
    };
    return { prisma, service: new ReferralReportingService(prisma, config) };
  }

  it('suppresses every metric for a partner cohort below the privacy minimum', async () => {
    const { service } = build([attribution('student-1', 'course-1', 'subject-1')]);
    const result: any = await service.partnerReport('partner-1', { from: '2026-08-01', to: '2026-08-31' });
    expect(result.privacy).toMatchObject({ suppressed: true, minimumCohort: 3 });
    expect(result).not.toHaveProperty('approvedSales');
    expect(JSON.stringify(result)).not.toContain('student-1');
    expect(JSON.stringify(result)).not.toContain('course-1');
  });

  it('omits small product/category breakdowns even when the overall cohort is safe', async () => {
    const { service } = build([
      attribution('student-1', 'course-safe', 'subject-safe'),
      attribution('student-2', 'course-safe', 'subject-safe'),
      attribution('student-3', 'course-safe', 'subject-safe'),
      attribution('student-1', 'course-small', 'subject-small'),
    ]);
    const result: any = await service.partnerReport('partner-1', { from: '2026-08-01', to: '2026-08-31' });
    expect(result.privacy.suppressed).toBe(false);
    expect(result.products).toEqual([expect.objectContaining({ productId: 'course-safe', learners: 3 })]);
    expect(result.categories).toEqual([expect.objectContaining({ categoryId: 'subject-safe', learners: 3 })]);
    expect(JSON.stringify(result)).not.toContain('course-small');
    expect(JSON.stringify(result)).not.toContain('subject-small');
    expect(JSON.stringify(result)).not.toContain('student-');
  });
});
