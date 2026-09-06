/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Prisma mocks are intentionally narrow. */
import { ContentStatus } from '../../common/types/roles.enum';
import { CatalogService } from './catalog.service';

describe('CatalogService hierarchy hasChildren', () => {
  function buildService() {
    const prisma = {
      subject: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
      subjectGrade: { findMany: jest.fn(), count: jest.fn() },
      course: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      chapter: { count: jest.fn() },
      lesson: { count: jest.fn() },
      section: { count: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    return { service: new CatalogService(prisma as never), prisma };
  }

  it('uses published relation counts and does not issue one child query per subject', async () => {
    const { service, prisma } = buildService();
    const assignments = [
      {
        subjectId: 'subject-with-published-course',
        sortOrder: 1,
        subject: {
          id: 'subject-with-published-course',
          title: 'Math',
          slug: 'math',
          description: null,
          sortOrder: 1,
          coverAssetId: null,
          _count: { courses: 1 },
        },
      },
      {
        subjectId: 'subject-with-only-draft-course',
        sortOrder: 2,
        subject: {
          id: 'subject-with-only-draft-course',
          title: 'Science',
          slug: 'science',
          description: null,
          sortOrder: 2,
          coverAssetId: null,
          _count: { courses: 0 },
        },
      },
    ];
    prisma.subjectGrade.findMany.mockResolvedValueOnce(assignments);
    prisma.subjectGrade.count.mockResolvedValueOnce(2);
    prisma.$transaction.mockResolvedValueOnce([assignments, 2]);

    const result = await service.subjects({
      academicGradeId: 'grade-1',
      page: 1,
      limit: 20,
    });

    expect(result.data.map((item) => item.hasChildren)).toEqual([true, false]);
    expect(prisma.subjectGrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          subject: {
            include: expect.objectContaining({
              _count: {
                select: {
                  courses: {
                    where: {
                      academicGradeId: 'grade-1',
                      status: ContentStatus.PUBLISHED,
                    },
                  },
                },
              },
            }),
          },
        }),
      }),
    );
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  it('does not duplicate a shared subject when searching without a grade', async () => {
    const { service, prisma } = buildService();
    prisma.$queryRaw.mockImplementation((query: { strings: string[] }) => {
      const sql = query.strings.join('');
      expect(sql).not.toContain('SubjectGrade');
      return [{ id: 'shared-subject', total: 1n }];
    });
    prisma.subject.findMany.mockResolvedValueOnce([
      {
        id: 'shared-subject',
        title: 'Mathematics',
        slug: 'mathematics',
        description: null,
        sortOrder: 1,
        coverAssetId: null,
        _count: { courses: 0 },
      },
    ]);

    const result = await service.subjects({ page: 1, limit: 20, q: 'math' });

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('requires a grade when listing courses for a shared subject', async () => {
    const { service, prisma } = buildService();
    prisma.subject.findUnique.mockResolvedValue({
      _count: { gradeAssignments: 2 },
    });

    await expect(
      service.courses({ subjectId: 'shared-subject', page: 1, limit: 20 }),
    ).rejects.toThrow('academicGradeId is required');
  });

  it('scopes public course listings by academic grade', async () => {
    const { service, prisma } = buildService();
    prisma.course.findMany.mockResolvedValue([]);
    prisma.course.count.mockResolvedValue(0);

    await service.courses({
      subjectId: 'shared-subject',
      academicGradeId: 'grade-11',
      page: 1,
      limit: 20,
    });

    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: 'shared-subject',
          academicGradeId: 'grade-11',
        }),
      }),
    );
  });

  it('returns aggregate nested content counts on a course detail', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirst.mockResolvedValue({
      id: 'course',
      title: 'Course',
      slug: 'course',
      description: null,
      sortOrder: 1,
      coverAssetId: null,
      _count: { chapters: 2 },
      academicGrade: {
        id: 'grade',
        title: 'Grade',
        slug: 'grade',
        description: null,
        sortOrder: 1,
        coverAssetId: null,
        _count: { subjectAssignments: 1 },
      },
      subject: {
        id: 'subject',
        title: 'Subject',
        slug: 'subject',
        description: null,
        sortOrder: 1,
        coverAssetId: null,
        _count: { courses: 1 },
        academicGrade: {
          id: 'grade',
          title: 'Grade',
          slug: 'grade',
          description: null,
          sortOrder: 1,
          coverAssetId: null,
          _count: { subjects: 1 },
        },
      },
    });
    prisma.$transaction.mockResolvedValue([2, 4, 7]);
    await expect(service.course('course')).resolves.toMatchObject({
      contentCounts: { chapters: 2, lessons: 4, sections: 7 },
    });
    expect(prisma.course.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subject: { status: ContentStatus.PUBLISHED },
          academicGrade: { status: ContentStatus.PUBLISHED },
        }),
      }),
    );
  });
});
