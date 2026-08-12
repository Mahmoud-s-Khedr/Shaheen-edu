import { PartnersService } from './partners.service';
import { AccountStatus, Role } from '../../common/types/roles.enum';

describe('PartnersService self-service profile updates', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    partnerProfile: { update: jest.fn() },
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
});
