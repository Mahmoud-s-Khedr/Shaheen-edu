/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Prisma mocks are intentionally narrow. */
import { ContentStatus } from '../../common/types/roles.enum';
import { CatalogService } from './catalog.service';

describe('CatalogService hierarchy hasChildren', () => {
  function buildService() {
    const prisma = {
      subject: { findMany: jest.fn(), count: jest.fn() },
      course: { findMany: jest.fn(), count: jest.fn() },
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
});
