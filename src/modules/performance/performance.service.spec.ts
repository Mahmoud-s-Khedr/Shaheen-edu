import { PerformanceService } from './performance.service';

describe('PerformanceService unified analytics helpers', () => {
  const service = new PerformanceService({} as any, {} as any, {} as any);
  const placement = {
    subjectId: 'subject',
    subjectTitle: 'Subject',
    courseId: 'course',
    courseTitle: 'Course',
    chapterId: 'chapter',
    chapterTitle: 'Chapter',
    lessonId: 'lesson',
    lessonTitle: 'Lesson',
    sectionId: 'section',
    sectionTitle: 'Section',
  };
  const activity = (
    id: string,
    source: 'ASSESSMENT' | 'PRACTICE',
    outcome: 'CORRECT' | 'INCORRECT' | 'OMITTED',
    submittedAt = new Date(),
  ) => ({
    id,
    source,
    questionId: id,
    outcome,
    submittedAt,
    placements: [placement],
  });

  it('combines assessment omissions and every practice retry with one accuracy definition', () => {
    expect(
      (service as any).metrics([
        activity('assessment-correct', 'ASSESSMENT', 'CORRECT'),
        activity('assessment-omitted', 'ASSESSMENT', 'OMITTED'),
        activity('practice-retry-1', 'PRACTICE', 'INCORRECT'),
        activity('practice-retry-2', 'PRACTICE', 'CORRECT'),
      ]),
    ).toEqual({
      total: 4,
      correct: 2,
      incorrect: 1,
      omitted: 1,
      answered: 3,
      accuracyPercent: 66.7,
    });
  });

  it('keeps lesson and section aggregation distinct', () => {
    const sectionTwo = {
      ...placement,
      sectionId: 'section-2',
      sectionTitle: 'Section 2',
    };
    const first = activity('first', 'ASSESSMENT', 'CORRECT');
    const second = {
      ...activity('second', 'PRACTICE', 'INCORRECT'),
      placements: [sectionTwo],
    };
    expect((service as any).groups([first, second], 'lesson')).toHaveLength(1);
    expect((service as any).groups([first, second], 'section')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'section', total: 1 }),
        expect.objectContaining({ id: 'section-2', total: 1 }),
      ]),
    );
  });

  it('requires two adequately sized 28-day windows before classifying a trend', () => {
    const now = new Date();
    const recent = new Date(now);
    recent.setUTCDate(recent.getUTCDate() - 1);
    const previous = new Date(now);
    previous.setUTCDate(previous.getUTCDate() - 29);
    const values = [
      ...Array.from({ length: 10 }, (_, index) =>
        activity(`recent-${index}`, 'PRACTICE', 'CORRECT', recent),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        activity(`previous-${index}`, 'ASSESSMENT', 'INCORRECT', previous),
      ),
    ];
    expect((service as any).trendClassification(values)).toMatchObject({
      status: 'IMPROVING',
      changePoints: 100,
    });
    expect(
      (service as any).trendClassification(values.slice(0, 10)),
    ).toMatchObject({
      status: 'INSUFFICIENT_DATA',
    });
  });
});
