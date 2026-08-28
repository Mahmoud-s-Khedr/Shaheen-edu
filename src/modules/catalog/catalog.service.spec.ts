/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Prisma mocks are intentionally narrow. */
import { ContentStatus } from '../../common/types/roles.enum';
import { CatalogService } from './catalog.service';

describe('CatalogService hierarchy hasChildren', () => {
  function buildService() {
    const prisma = {
      subject: { findMany: jest.fn(), count: jest.fn() },
      course: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      chapter: { count: jest.fn() },
      lesson: { count: jest.fn() },
      section: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    return { service: new CatalogService(prisma as never), prisma };
  }

  it('uses published relation counts and does not issue one child query per subject', async () => {
    const { service, prisma } = buildService();
    prisma.subject.findMany.mockResolvedValueOnce([
      { id: 'subject-with-published-course', title: 'Math', slug: 'math', description: null, sortOrder: 1, coverAssetId: null, _count: { courses: 1 } },
      { id: 'subject-with-only-draft-course', title: 'Science', slug: 'science', description: null, sortOrder: 2, coverAssetId: null, _count: { courses: 0 } },
    ]);
    prisma.subject.count.mockResolvedValueOnce(2);

    const result = await service.subjects({ academicGradeId: 'grade-1', page: 1, limit: 20 });

    expect(result.data.map((item) => item.hasChildren)).toEqual([true, false]);
    expect(prisma.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: { select: { courses: { where: { status: ContentStatus.PUBLISHED } } } },
        }),
      }),
    );
    expect(prisma.course.findMany).not.toHaveBeenCalled();
  });

  it('returns aggregate nested content counts on a course detail', async () => {
    const { service, prisma } = buildService();
    prisma.course.findFirst.mockResolvedValue({
      id: 'course', title: 'Course', slug: 'course', description: null, sortOrder: 1, coverAssetId: null,
      _count: { chapters: 2 }, subject: { id: 'subject', title: 'Subject', slug: 'subject', description: null, sortOrder: 1, coverAssetId: null, _count: { courses: 1 }, academicGrade: { id: 'grade', title: 'Grade', slug: 'grade', description: null, sortOrder: 1, coverAssetId: null, _count: { subjects: 1 } } },
    });
    prisma.$transaction.mockResolvedValue([2, 4, 7]);
    await expect(service.course('course')).resolves.toMatchObject({ contentCounts: { chapters: 2, lessons: 4, sections: 7 } });
  });
});
