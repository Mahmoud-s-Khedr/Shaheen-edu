import { PartnersService } from './partners.service';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  PartnerAllocationState,
  Role,
} from '../../common/types/roles.enum';

describe('PartnersService login email changes', () => {
  const actor = {
    id: 'admin-1',
    role: Role.SUPER_ADMIN,
    sessionId: 'session-1',
  };
  const partner = {
    id: 'partner-1',
    role: Role.PARTNER,
    status: AccountStatus.ACTIVE,
    loginIdentifier: 'referral@example.com',
    createdAt: new Date(),
    partnerProfile: null,
  };
  const tx = {
    user: { updateMany: jest.fn() },
    authSession: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { recordWithClient: jest.fn() };
  const service = new PartnersService(
    prisma as any,
    {} as any,
    {} as any,
    audit as any,
  );
  const email = 'ibraheim.tarek@jibal-platform.com';

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockReset();
    tx.user.updateMany.mockReset();
    prisma.user.findUnique.mockResolvedValue(partner);
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );
  });

  it.each([Role.SUPER_ADMIN])(
    'allows %s to change only the login email on the existing user',
    async (role) => {
      prisma.user.findUnique
        .mockResolvedValueOnce(partner)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...partner, loginIdentifier: email });
      const result = await service.updateEmail({ ...actor, role }, partner.id, {
        email: ` ${email.toUpperCase()} `,
      });
      expect(result).toMatchObject({ id: partner.id, loginIdentifier: email });
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: partner.id,
          role: Role.PARTNER,
          loginIdentifier: partner.loginIdentifier,
        },
        data: { loginIdentifier: email },
      });
      expect(tx.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: partner.id, revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
      expect(audit.recordWithClient).toHaveBeenCalledWith(tx, {
        actorUserId: actor.id,
        action: 'PARTNER_EMAIL_UPDATED',
        targetType: 'User',
        targetId: partner.id,
        metadata: { previousEmail: partner.loginIdentifier, email },
      });
    },
  );

  it('rejects a partner actor before reading or writing data', async () => {
    await expect(
      service.updateEmail({ ...actor, role: Role.PARTNER }, partner.id, {
        email,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([null, { ...partner, role: Role.ADMIN }])(
    'rejects a missing or non-partner account (%j)',
    async (target) => {
      prisma.user.findUnique.mockResolvedValue(target);
      await expect(
        service.updateEmail(actor, partner.id, { email }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects an email already used by another account', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(partner)
      .mockResolvedValueOnce({ id: 'other-user' });
    await expect(
      service.updateEmail(actor, partner.id, { email }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves sessions unchanged when the email already matches', async () => {
    await service.updateEmail(actor, partner.id, {
      email: partner.loginIdentifier,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a concurrent login change before revoking sessions or auditing', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(partner)
      .mockResolvedValueOnce(null);
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateEmail(actor, partner.id, { email }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(audit.recordWithClient).not.toHaveBeenCalled();
  });

  it('reports a duplicate email created concurrently as a conflict', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(partner)
      .mockResolvedValueOnce(null);
    tx.user.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate email', {
        code: 'P2002',
        clientVersion: '6.19.2',
      }),
    );
    await expect(
      service.updateEmail(actor, partner.id, { email }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('PartnersService password resets', () => {
  const dto = { password: ' AdminChosenPassword123! ' };
  const actor = {
    id: 'admin-1',
    role: Role.SUPER_ADMIN,
    sessionId: 'session-1',
  };
  const tx = {
    user: { updateMany: jest.fn() },
    authSession: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const passwordService = { hash: jest.fn() };
  const auditService = { recordWithClient: jest.fn() };
  const service = new PartnersService(
    prisma as any,
    passwordService as any,
    {} as any,
    auditService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'partner-1',
      role: Role.PARTNER,
      status: AccountStatus.ACTIVE,
      mustChangePassword: true,
    });
    passwordService.hash.mockResolvedValue('new-hash');
    tx.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each([Role.SUPER_ADMIN])(
    'allows %s to reset an active partner, revoke sessions, and audit atomically',
    async (role) => {
      const result = await service.resetPassword(
        { ...actor, role },
        'partner-1',
        dto,
      );

      const passwordResetAt = (
        tx.user.updateMany.mock.calls[0][0] as {
          data: { passwordResetAt: Date };
        }
      ).data.passwordResetAt;
      expect(passwordResetAt).toBeInstanceOf(Date);
      expect(result).toEqual({ success: true });
      expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          role: Role.PARTNER,
          status: AccountStatus.ACTIVE,
        },
        data: {
          passwordHash: 'new-hash',
          mustChangePassword: false,
          passwordResetAt,
        },
      });
      expect(tx.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'partner-1', revoked: false },
        data: {
          revoked: true,
          revokedAt: passwordResetAt,
        },
      });
      expect(auditService.recordWithClient).toHaveBeenCalledWith(tx, {
        actorUserId: actor.id,
        action: 'PARTNER_PASSWORD_RESET',
        targetType: 'User',
        targetId: 'partner-1',
      });
    },
  );

  it.each([Role.PARTNER, Role.STUDENT])('rejects %s actors', async (role) => {
    await expect(
      service.resetPassword({ ...actor, role }, 'partner-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([null, { role: Role.ADMIN }, { role: Role.STUDENT }])(
    'rejects missing or non-partner targets (%j)',
    async (target) => {
      prisma.user.findUnique.mockResolvedValue(target);
      await expect(
        service.resetPassword(actor, 'partner-1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(passwordService.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects inactive partners', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: Role.PARTNER,
      status: AccountStatus.SUSPENDED,
    });
    await expect(
      service.resetPassword(actor, 'partner-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a concurrent account state change before revoking sessions or auditing', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.resetPassword(actor, 'partner-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(auditService.recordWithClient).not.toHaveBeenCalled();
  });
});

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
      { id: 'admin-1', role: Role.SUPER_ADMIN } as any,
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
