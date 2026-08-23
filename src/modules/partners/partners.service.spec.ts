import { PartnersService } from './partners.service';
import {
  AccountStatus,
  PartnerAllocationState,
  Role,
} from '../../common/types/roles.enum';

describe('PartnersService self-service profile updates', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    partnerProfile: { update: jest.fn() },
    publisherAgreement: { findMany: jest.fn() },
    referralProgram: { findMany: jest.fn() },
    partnerAllocation: { groupBy: jest.fn() },
    adminAuditLog: { findMany: jest.fn() },
  };
  const auditService = { record: jest.fn() };
  const service = new PartnersService(
    prisma as any,
    {} as any,
    {} as any,
    auditService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('updates only the authenticated partner profile and records the change', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'partner-1', role: Role.PARTNER })
      .mockResolvedValueOnce({
        id: 'partner-1',
        role: Role.PARTNER,
        status: AccountStatus.ACTIVE,
        loginIdentifier: 'partner@example.com',
        createdAt: new Date(),
        partnerProfile: {
          partnerType: 'CONTENT_PUBLISHER',
          displayName: 'New name',
          legalName: null,
          phone: null,
        },
      });

    await service.updateOwnProfile('partner-1', {
      displayName: 'New name',
      legalName: null,
      phone: null,
    });

    expect(prisma.partnerProfile.update).toHaveBeenCalledWith({
      where: { userId: 'partner-1' },
      data: { displayName: 'New name', legalName: null, phone: null },
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'partner-1',
        action: 'PARTNER_SELF_UPDATED',
        targetId: 'partner-1',
      }),
    );
  });

  it('returns administrative partner history as ledger aggregates without order or learner records', async () => {
    const partner = {
      id: 'partner-1',
      role: Role.PARTNER,
      status: AccountStatus.ACTIVE,
      loginIdentifier: 'publisher@example.com',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      partnerProfile: {
        partnerType: 'CONTENT_PUBLISHER',
        displayName: 'Publisher',
        legalName: 'Publisher LLC',
        phone: '+201000000000',
      },
    };
    prisma.user.findUnique.mockResolvedValue(partner);
    prisma.publisherAgreement.findMany.mockResolvedValue([
      {
        id: 'agreement-1',
        status: 'ACTIVE',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: null,
        course: { id: 'course-1', title: 'Course' },
        chapter: null,
        lesson: null,
      },
    ]);
    prisma.referralProgram.findMany.mockResolvedValue([]);
    prisma.partnerAllocation.groupBy.mockResolvedValue([
      {
        state: PartnerAllocationState.PAYABLE,
        currency: 'EGP',
        _count: { _all: 2 },
        _sum: { basisMinor: 20000, amountMinor: 4000 },
      },
    ]);
    prisma.adminAuditLog.findMany.mockResolvedValue([
      {
        id: 'audit-1',
        action: 'PARTNER_UPDATED',
        targetType: 'User',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        correlationId: 'request-1',
        actorUserId: 'admin-1',
      },
    ]);

    const result = await service.detail(
      { id: 'admin-1', role: Role.ADMIN } as any,
      partner.id,
    );

    expect(result).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({
          id: partner.id,
          status: AccountStatus.ACTIVE,
        }),
        capability: expect.objectContaining({
          canPublishContent: true,
          canReferCustomers: false,
        }),
        publisherAgreements: [
          expect.objectContaining({
            id: 'agreement-1',
            isCurrent: true,
            target: { type: 'COURSE', id: 'course-1', title: 'Course' },
          }),
        ],
        allocationTotalsByState: expect.arrayContaining([
          expect.objectContaining({
            state: PartnerAllocationState.PAYABLE,
            allocationCount: 2,
            amountMinor: 4000,
          }),
          expect.objectContaining({
            state: PartnerAllocationState.PAID,
            allocationCount: 0,
          }),
        ]),
        auditSummary: expect.objectContaining({
          recentEvents: [expect.objectContaining({ id: 'audit-1' })],
        }),
      }),
    );
    expect(prisma.publisherAgreement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ allocations: expect.anything() }),
      }),
    );
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ metadata: expect.anything() }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'PARTNER_DETAIL_VIEWED',
        targetId: partner.id,
      }),
    );
  });
});
