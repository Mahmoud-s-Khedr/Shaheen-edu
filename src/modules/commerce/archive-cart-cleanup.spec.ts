import { Role } from '../../common/types/roles.enum';
import { ChaptersService } from '../chapters/chapters.service';
import { CoursesService } from '../courses/courses.service';

describe('course and chapter archive cart cleanup', () => {
  const actor = { id: 'admin-1', role: Role.ADMIN } as any;

  it('archives a course, its direct cart entries, and descendant chapter entries atomically', async () => {
    const tx: any = {
      course: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = { recordWithClient: jest.fn().mockResolvedValue(undefined) };
    const publication = { assertCanArchive: jest.fn().mockResolvedValue(undefined) };
    const service = new CoursesService(prisma, audit as any, publication as any);
    (service as any).getOrThrow = jest.fn().mockResolvedValue({ id: 'course-1' });

    await service.archive(actor, 'course-1');

    expect(publication.assertCanArchive).toHaveBeenCalledWith(
      'course',
      'course-1',
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { courseId: 'course-1' },
          { chapter: { courseId: 'course-1' } },
        ],
      },
    });
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'COURSE_ARCHIVED',
        metadata: { prunedCartItemCount: 3 },
      }),
    );
  });

  it('archives a chapter and only its direct cart entries atomically', async () => {
    const tx: any = {
      chapter: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const audit = { recordWithClient: jest.fn().mockResolvedValue(undefined) };
    const publication = { assertCanArchive: jest.fn().mockResolvedValue(undefined) };
    const service = new ChaptersService(prisma, audit as any, publication as any);
    (service as any).getOrThrow = jest.fn().mockResolvedValue({ id: 'chapter-1' });

    await service.archive(actor, 'chapter-1');

    expect(publication.assertCanArchive).toHaveBeenCalledWith(
      'chapter',
      'chapter-1',
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { chapterId: 'chapter-1' },
    });
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'CHAPTER_ARCHIVED',
        metadata: { prunedCartItemCount: 1 },
      }),
    );
  });
});
