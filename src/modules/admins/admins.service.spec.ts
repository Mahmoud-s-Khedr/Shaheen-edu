import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AccountStatus, Role } from '../../common/types/roles.enum';

describe('AdminsService password resets', () => {
  const tx = {
    user: { update: jest.fn() },
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
  const service = new AdminsService(
    prisma as any,
    passwordService as any,
    {} as any,
    auditService as any,
  );
  const superAdmin = {
    id: 'super-admin-1',
    role: Role.SUPER_ADMIN,
    sessionId: 'session-1',
  };

  beforeEach(() => jest.clearAllMocks());

  it('allows only a super admin to reset an active administrator', async () => {
    await expect(
      service.resetPassword({ ...superAdmin, role: Role.ADMIN }, 'admin-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: Role.ADMIN,
      status: AccountStatus.SUSPENDED,
    });
    await expect(
      service.resetPassword(superAdmin, 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates the credential, revokes sessions, and audits the reset in one transaction', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      role: Role.ADMIN,
      status: AccountStatus.ACTIVE,
    });
    passwordService.hash.mockResolvedValue('new-hash');

    const result = await service.resetPassword(superAdmin, 'admin-1');

    expect(passwordService.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-1' },
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: true,
        }),
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'admin-1', revoked: false } }),
    );
    expect(auditService.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'ADMIN_PASSWORD_RESET',
        targetId: 'admin-1',
        actorUserId: superAdmin.id,
      }),
    );
  });
});
