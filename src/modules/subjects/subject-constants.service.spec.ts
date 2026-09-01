import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '../../common/types/roles.enum';
import { SubjectConstantsService } from './subject-constants.service';

describe('SubjectConstantsService', () => {
  const admin: any = { id: 'admin', role: Role.ADMIN };
  const student: any = { id: 'student', role: Role.STUDENT };
  function build() {
    const prisma: any = {
      subject: { findUnique: jest.fn().mockResolvedValue({ id: 'subject' }) },
      subjectConstant: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    return {
      service: new SubjectConstantsService(prisma, {
        record: jest.fn(),
      } as any),
      prisma,
    };
  }
  it('rejects admin writes from non-admin users', async () => {
    const { service } = build();
    await expect(
      service.create(student, 'subject', { key: 'g', value: '9.8' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('maps per-subject duplicate keys to a conflict', async () => {
    const { service, prisma } = build();
    prisma.subjectConstant.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create(admin, 'subject', { key: 'g', value: '9.8' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
