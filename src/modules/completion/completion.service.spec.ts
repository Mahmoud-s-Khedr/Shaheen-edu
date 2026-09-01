import { CompletionService } from './completion.service';

describe('CompletionService', () => {
  it('derives course and nested container completion from the same placement set', async () => {
    const prisma: any = {
      contentPlacement: {
        findMany: jest.fn().mockResolvedValue([
          {
            contentItemId: 'one',
            resolvedCourseId: 'course',
            resolvedChapterId: 'chapter',
            resolvedLessonId: null,
            resolvedSectionId: null,
          },
          {
            contentItemId: 'two',
            resolvedCourseId: 'course',
            resolvedChapterId: 'chapter',
            resolvedLessonId: 'lesson',
            resolvedSectionId: 'section',
          },
        ]),
      },
      studentContentProgress: {
        findMany: jest.fn().mockResolvedValue([{ contentItemId: 'one' }]),
      },
    };
    const result = await new CompletionService(prisma).containers('student', [
      { type: 'course', id: 'course' },
      { type: 'chapter', id: 'chapter' },
      { type: 'section', id: 'section' },
    ]);
    expect(result.get('course:course')).toBe(false);
    expect(result.get('chapter:chapter')).toBe(false);
    expect(result.get('section:section')).toBe(false);
  });

  it('does not mark empty containers complete', async () => {
    const prisma: any = {
      contentPlacement: { findMany: jest.fn().mockResolvedValue([]) },
      studentContentProgress: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result = await new CompletionService(prisma).containers('student', [
      { type: 'course', id: 'empty' },
    ]);
    expect(result.get('course:empty')).toBe(false);
  });
});
