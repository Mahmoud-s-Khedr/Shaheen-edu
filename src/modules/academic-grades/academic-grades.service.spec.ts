/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest mock/matcher plumbing is untyped by design */
import { ConflictException } from '@nestjs/common';
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
    const publicationService = {};
    const service = new AcademicGradesService(
      prisma as never,
      auditService as never,
      publicationService as never,
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
    });

    const result = await service.create(actor, { title: 'Grade 10' });

    expect(prisma.academicGrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'grade-10',
          sortOrder: 5,
        }),
      }),
    );
    expect(result.slug).toBe('grade-10');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GRADE_CREATED' }),
    );
  });

  it('updates without a version precondition', async () => {
    const { service, prisma } = buildService();
    const record = {
      id: 'g1',
      slug: 'grade-10',
      title: 'Grade 10',
    };
    prisma.academicGrade.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(record);
    await service.update(actor, 'g1', { title: 'Grade 10' });
    expect(prisma.academicGrade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g1' } }),
    );
  });
});
