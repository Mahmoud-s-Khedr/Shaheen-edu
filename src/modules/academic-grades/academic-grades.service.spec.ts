/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest mock/matcher plumbing is untyped by design */
import { ConflictException } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AcademicGradesService } from './academic-grades.service';

describe('AcademicGradesService', () => {
  const actor: RequestUser = {
    id: 'admin-1',
    role: Role.ADMIN,
    sessionId: 's1',
  };

  function buildService() {
    const prisma = {
      academicGrade: {
        findUnique: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      subject: {
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const auditService = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AcademicGradesService(
      prisma as never,
      auditService as never,
    );
    return { service, prisma, auditService };
  }

  it('rejects create when the slug already exists', async () => {
    const { service, prisma } = buildService();
    prisma.academicGrade.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create(actor, { title: 'Grade 10', slug: 'grade-10' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates with an auto-derived slug and the next sortOrder', async () => {
    const { service, prisma, auditService } = buildService();
    prisma.academicGrade.findUnique.mockResolvedValue(null);
    prisma.academicGrade.aggregate.mockResolvedValue({
      _max: { sortOrder: 4 },
    });
    prisma.academicGrade.create.mockResolvedValue({
      id: 'g1',
      title: 'Grade 10',
      slug: 'grade-10',
      description: null,
      sortOrder: 5,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
      archivedAt: null,
      version: 1,
    });

    const result = await service.create(actor, { title: 'Grade 10' });

    expect(prisma.academicGrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'grade-10',
          sortOrder: 5,
          version: 1,
        }),
      }),
    );
    expect(result.slug).toBe('grade-10');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GRADE_CREATED' }),
    );
  });

  it('throws a 409 AppException on stale version during update', async () => {
    const { service, prisma } = buildService();
    const record = {
      id: 'g1',
      slug: 'grade-10',
      title: 'Grade 10',
    };
    // update() calls getOrThrow twice: once at the start, once more to
    // read the current state after the version-guarded updateMany reports
    // no rows affected.
    prisma.academicGrade.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(record);
    prisma.academicGrade.updateMany.mockResolvedValue({ count: 0 });

    try {
      await service.update(actor, 'g1', { version: 1 });
      fail('expected service.update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.CONFLICT);
    }
  });
});
