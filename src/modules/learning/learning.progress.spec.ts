import { LearningService } from './learning.service';

describe('LearningService derived hierarchy completion', () => {
  function build(completedIds: string[]) {
    const prisma: any = {
      studentContentProgress: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            completedIds.map((contentItemId) => ({ contentItemId })),
          ),
      },
    };
    return {
      service: new LearningService(
        prisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    };
  }

  const course = { id: 'course-1', title: 'Course' };
  const chapter = { id: 'chapter-1', title: 'Chapter', course };
  const lesson = { id: 'lesson-1', title: 'Lesson', chapter };
  const section = { id: 'section-1', title: 'Section', lesson };
  const items = [
    { id: 'course-item', placement: { course } },
    { id: 'chapter-item', placement: { chapter } },
    { id: 'lesson-item', placement: { lesson } },
    { id: 'section-item', placement: { section } },
  ];

  it('marks each populated node complete only when all direct and descendant items are complete', async () => {
    const { service } = build(['course-item', 'chapter-item', 'lesson-item']);

    const nodes = await (service as any).rollup('student-1', items);

    expect(nodes.find((node: any) => node.id === course.id)).toMatchObject({
      totalContentItems: 4,
      completedContentItems: 3,
      completionPercent: 75,
      completed: false,
    });
    expect(nodes.find((node: any) => node.id === chapter.id)).toMatchObject({
      totalContentItems: 3,
      completedContentItems: 2,
      completed: false,
    });
    expect(nodes.find((node: any) => node.id === section.id)).toMatchObject({
      totalContentItems: 1,
      completedContentItems: 0,
      completed: false,
    });
  });

  it('automatically marks every populated ancestor complete after its final item is completed', async () => {
    const { service } = build(items.map((item) => item.id));

    const nodes = await (service as any).rollup('student-1', items);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: course.id, completed: true }),
        expect.objectContaining({ id: chapter.id, completed: true }),
        expect.objectContaining({ id: lesson.id, completed: true }),
        expect.objectContaining({ id: section.id, completed: true }),
      ]),
    );
  });
});
