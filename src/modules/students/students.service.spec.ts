import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { AccountStatus, Role } from '../../common/types/roles.enum';

const actor = { id: 'admin-1', role: Role.ADMIN, sessionId: 'session-1' };

describe('StudentsService administration', () => {
  const tx = {
    user: { updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    authSession: { updateMany: jest.fn() },
    parentAccessSession: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const passwordService = { hash: jest.fn() };
  const auditService = { recordWithClient: jest.fn() };
  const service = new StudentsService(prisma as any, passwordService as any, auditService as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects student-administration operations by non-admin actors', async () => {
    await expect(service.resetPassword({ ...actor, role: Role.STUDENT }, 'student-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resets an active student atomically, revokes sessions, and records an audit event', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'student-1', role: Role.STUDENT, status: AccountStatus.ACTIVE });
    passwordService.hash.mockResolvedValue('new-hash');
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.authSession.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.resetPassword(actor, 'student-1');

    expect(passwordService.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'student-1', role: Role.STUDENT, status: AccountStatus.ACTIVE }), data: expect.objectContaining({ passwordHash: 'new-hash', mustChangePassword: true }) }));
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'student-1', revoked: false } }));
    expect(auditService.recordWithClient).toHaveBeenCalledWith(tx, expect.objectContaining({ actorUserId: actor.id, action: 'STUDENT_PASSWORD_RESET', targetId: 'student-1' }));
  });

  it('turns a concurrent reset transition into a conflict', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'student-1', role: Role.STUDENT, status: AccountStatus.ACTIVE });
    passwordService.hash.mockResolvedValue('new-hash');
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.resetPassword(actor, 'student-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('requires a nonblank deletion reason before mutating the account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'student-1', role: Role.STUDENT, status: AccountStatus.ACTIVE });

    await expect(service.softDelete(actor, 'student-1', { deletionReason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
