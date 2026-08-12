import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const passwordService = { hash: jest.fn() };
  const auditService = { recordWithClient: jest.fn() };
  const service = new StudentsService(
    prisma as any,
    passwordService as any,
    auditService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects student-administration operations by non-admin actors', async () => {
    await expect(
      service.resetPassword({ ...actor, role: Role.STUDENT }, 'student-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resets an active student atomically, revokes sessions, and records an audit event', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: Role.STUDENT,
      status: AccountStatus.ACTIVE,
    });
    passwordService.hash.mockResolvedValue('new-hash');
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.authSession.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.resetPassword(actor, 'student-1');

    expect(passwordService.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'student-1',
          role: Role.STUDENT,
          status: AccountStatus.ACTIVE,
        }),
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: true,
        }),
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1', revoked: false },
      }),
    );
    expect(auditService.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorUserId: actor.id,
        action: 'STUDENT_PASSWORD_RESET',
        targetId: 'student-1',
      }),
    );
  });

  it('turns a concurrent reset transition into a conflict', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: Role.STUDENT,
      status: AccountStatus.ACTIVE,
    });
    passwordService.hash.mockResolvedValue('new-hash');
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.resetPassword(actor, 'student-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('requires a nonblank deletion reason before mutating the account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: Role.STUDENT,
      status: AccountStatus.ACTIVE,
    });

    await expect(
      service.softDelete(actor, 'student-1', { deletionReason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('StudentsService self-service profile updates', () => {
  const tx = {
    studentProfile: { update: jest.fn() },
    parentAccessSession: { updateMany: jest.fn() },
    adminAuditLog: { create: jest.fn() },
  };
  const prisma = {
    academicGrade: { findFirst: jest.fn() },
    governorate: { findUnique: jest.fn() },
    center: { findFirst: jest.fn() },
    studentProfile: { findUniqueOrThrow: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const auditService = { recordWithClient: jest.fn() };
  const service = new StudentsService(
    prisma as any,
    {} as any,
    auditService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('updates mutable fields and revokes old parent sessions when the parent phone changes', async () => {
    prisma.academicGrade.findFirst.mockResolvedValue({ id: 'grade-2' });
    prisma.studentProfile.findUniqueOrThrow.mockResolvedValue({
      governorateId: 'gov-1',
      parentPhoneNormalized: '01011112222',
    });
    prisma.governorate.findUnique.mockResolvedValue({
      id: 'gov-2',
      nameAr: 'Giza',
    });
    prisma.center.findFirst.mockResolvedValue({
      id: 'center-2',
      nameAr: 'Dokki',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      status: AccountStatus.ACTIVE,
      loginIdentifier: '01099998888',
      createdAt: new Date(),
      studentProfile: {
        fullName: 'Renamed Student',
        governorate: 'Giza',
        center: 'Dokki',
        nationalIdLast4: '1234',
        academicGradeId: 'grade-2',
        parentPhoneNormalized: '01033334444',
        governorateRef: null,
        centerRef: null,
      },
    });

    const result = await service.updateOwnProfile('student-1', {
      fullName: 'Renamed Student',
      parentPhone: '+201033334444',
      governorateId: 'gov-2',
      centerId: 'center-2',
      academicGradeId: 'grade-2',
    });

    expect(tx.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1' },
        data: expect.objectContaining({
          fullName: 'Renamed Student',
          parentPhoneNormalized: '01033334444',
          governorateId: 'gov-2',
          centerId: 'center-2',
          academicGradeId: 'grade-2',
        }),
      }),
    );
    expect(tx.parentAccessSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentPhoneNormalized: '01011112222', revoked: false },
      }),
    );
    expect(auditService.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'STUDENT_SELF_UPDATED',
        targetId: 'student-1',
      }),
    );
    expect(result.studentProfile).toMatchObject({
      parentPhone: '01033334444',
    });
    expect(result.studentProfile).not.toHaveProperty('parentPhoneNormalized');
  });
});
