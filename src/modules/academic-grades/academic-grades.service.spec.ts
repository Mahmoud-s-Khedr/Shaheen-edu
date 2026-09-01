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
      $executeRaw: jest.fn(),
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
      service.create(actor, {
        title: { ar: 'الصف العاشر', en: 'Grade 10' },
        slug: 'grade-10',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates with an auto-derived slug and the next sortOrder', async () => {
    const { service, prisma, auditService } = buildService();
    prisma.academicGrade.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'g1',
        titleAr: 'الصف العاشر',
        titleEn: 'Grade 10',
        slug: 'grade-10',
        descriptionAr: null,
        descriptionEn: null,
        sortOrder: 5,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
        archivedAt: null,
        coverAsset: null,
        _count: { subjects: 0 },
      });
    prisma.academicGrade.aggregate.mockResolvedValue({
      _max: { sortOrder: 4 },
    });
    prisma.academicGrade.create.mockResolvedValue({
      id: 'g1',
      titleAr: 'الصف العاشر',
      titleEn: 'Grade 10',
      slug: 'grade-10',
      descriptionAr: null,
      descriptionEn: null,
      sortOrder: 5,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
      archivedAt: null,
    });

    const result = await service.create(actor, {
      title: { ar: 'الصف العاشر', en: 'Grade 10' },
    });

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
      titleAr: 'الصف العاشر',
      titleEn: 'Grade 10',
    };
    prisma.academicGrade.findUnique
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(record);
    await service.update(actor, 'g1', {
      title: { ar: 'الصف العاشر', en: 'Grade 10' },
    });
    expect(prisma.academicGrade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'g1' } }),
    );
  });

  it('maps the non-archived subject relation count without extra child queries', async () => {
    const { service, prisma } = buildService();
    const grade = {
      id: 'g1',
      titleAr: 'الصف العاشر',
      titleEn: 'Grade 10',
      slug: 'grade-10',
      descriptionAr: null,
      descriptionEn: null,
      sortOrder: 1,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: null,
      archivedAt: null,
      coverAssetId: null,
    };
    prisma.academicGrade.findMany.mockResolvedValueOnce([
      { ...grade, _count: { subjects: 1 } },
      { ...grade, _count: { subjects: 0 } },
    ]);
    prisma.academicGrade.count.mockResolvedValueOnce(2);

    const result = await service.list(actor, { page: 1, limit: 20 });

    expect(result.data.map((item) => item.hasChildren)).toEqual([true, false]);
    expect(prisma.academicGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: { subjects: { where: { status: { not: 'ARCHIVED' } } } },
          },
        }),
      }),
    );
    expect(prisma.subject.count).not.toHaveBeenCalled();
  });

  it('reorders a large grade list with two bulk updates rather than per-grade updates', async () => {
    const { service, prisma, auditService } = buildService();
    const items = Array.from({ length: 674 }, (_, index) => ({
      id: `grade-${index + 1}`,
      sortOrder: 674 - index,
    }));
    prisma.academicGrade.findMany.mockResolvedValue(
      items.map(({ id }, index) => ({ id, sortOrder: index + 1 })),
    );
    prisma.$executeRaw.mockResolvedValue(674);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>) =>
        callback(prisma),
    );

    await service.reorder(actor, { items });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.academicGrade.updateMany).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GRADE_REORDERED',
        metadata: { itemIds: items.map((item) => item.id) },
      }),
    );
  });
});
