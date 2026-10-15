import { PerformanceService } from './performance.service';

describe('PerformanceService unified analytics helpers', () => {
  const service = new PerformanceService({} as never, {} as never, {} as never);
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

  const helpers = service as unknown as {
    metrics(values: ReturnType<typeof activity>[]): unknown;
    groups(values: ReturnType<typeof activity>[], level: string): unknown[];
    trendClassification(values: ReturnType<typeof activity>[]): unknown;
    dates(query: { from?: string; to?: string }): { submittedAt: unknown };
  };

  it('combines assessment omissions and every practice retry with one accuracy definition', () => {
    expect(
      helpers.metrics([
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
    expect(helpers.groups([first, second], 'lesson')).toHaveLength(1);
    expect(helpers.groups([first, second], 'section')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'section', total: 1 }),
        expect.objectContaining({ id: 'section-2', total: 1 }),
      ]),
    );
  });

  it('requires an answered question in each 28-day window before classifying a trend', () => {
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
    expect(helpers.trendClassification(values)).toMatchObject({
      status: 'IMPROVING',
      changePoints: 100,
    });
    expect(helpers.trendClassification(values.slice(0, 10))).toMatchObject({
      status: 'INSUFFICIENT_DATA',
    });
  });
  it('compares small real samples without a ten-answer gate', () => {
    const recent = new Date();
    const previous = new Date(recent);
    previous.setUTCDate(previous.getUTCDate() - 29);
    expect(
      helpers.trendClassification([
        activity('new', 'ASSESSMENT', 'CORRECT', recent),
        activity('old', 'ASSESSMENT', 'INCORRECT', previous),
      ]),
    ).toMatchObject({ status: 'IMPROVING', changePoints: 100 });
    expect(
      helpers.trendClassification([
        activity('new', 'ASSESSMENT', 'CORRECT', recent),
        activity('old', 'ASSESSMENT', 'OMITTED', previous),
      ]),
    ).toMatchObject({ status: 'INSUFFICIENT_DATA', changePoints: null });
  });

  it('returns the reported student counts, weaknesses and omissions from small samples', async () => {
    const values = [
      activity('correct', 'ASSESSMENT', 'CORRECT'),
      ...Array.from({ length: 4 }, (_, i) =>
        activity(`wrong-${i}`, 'ASSESSMENT', 'INCORRECT'),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        activity(`skipped-${i}`, 'ASSESSMENT', 'OMITTED'),
      ),
    ];
    const subjectService = new PerformanceService(
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(
        subjectService as unknown as { dataset: () => Promise<unknown> },
        'dataset',
      )
      .mockResolvedValue({ eligibleIds: [], activities: values });
    const result = await subjectService.insights('student', {}, false);
    expect(result).toMatchObject({
      status: 'AVAILABLE',
      minimumAnsweredAttempts: 1,
      total: 12,
      answered: 5,
      correct: 1,
      incorrect: 4,
      omitted: 7,
      accuracyPercent: 20,
      weaknesses: [
        expect.objectContaining({
          id: 'section',
          answered: 5,
          recommendation: 'REVIEW_TOPIC',
        }),
      ],
      limitedPractice: [expect.objectContaining({ answered: 5 })],
      omissions: [expect.objectContaining({ omitted: 7 })],
      trend: { status: 'INSUFFICIENT_DATA', changePoints: null },
    });
    expect(result).not.toHaveProperty('errorReasons');
    const analysis = await subjectService.analysis('student', {
      level: 'subject',
      page: 1,
      limit: 20,
    });
    expect(analysis.data).toEqual([
      expect.objectContaining({ total: 12, answered: 5, accuracyPercent: 20 }),
    ]);
  });

  it('does not invent strengths or weaknesses for empty or omitted-only data', async () => {
    const subjectService = new PerformanceService(
      {} as never,
      {} as never,
      {} as never,
    );
    const dataset = jest.spyOn(
      subjectService as unknown as { dataset: () => Promise<unknown> },
      'dataset',
    );
    dataset.mockResolvedValue({ eligibleIds: [], activities: [] });
    await expect(
      subjectService.insights('student', {}, false),
    ).resolves.toMatchObject({
      status: 'INSUFFICIENT_DATA',
      total: 0,
      strengths: [],
      weaknesses: [],
    });
    dataset.mockResolvedValue({
      eligibleIds: [],
      activities: [activity('skipped', 'ASSESSMENT', 'OMITTED')],
    });
    await expect(
      subjectService.insights('student', {}, false),
    ).resolves.toMatchObject({
      status: 'INSUFFICIENT_DATA',
      total: 1,
      answered: 0,
      omitted: 1,
      strengths: [],
      weaknesses: [],
      omissions: [expect.objectContaining({ omitted: 1 })],
    });
  });

  it('uses Cairo date boundaries, including daylight-saving changes, and rejects invalid ranges', () => {
    expect(
      helpers.dates({ from: '2026-10-12', to: '2026-10-13' }).submittedAt,
    ).toEqual({
      gte: new Date('2026-10-11T21:00:00Z'),
      lt: new Date('2026-10-13T21:00:00Z'),
    });
    expect(
      helpers.dates({ from: '2026-10-29', to: '2026-10-30' }).submittedAt,
    ).toEqual({
      gte: new Date('2026-10-28T21:00:00Z'),
      lt: new Date('2026-10-30T22:00:00Z'),
    });
    expect(() =>
      helpers.dates({ from: '2026-10-15', to: '2026-10-12' }),
    ).toThrow('from must be on or before to');
    expect(() => helpers.dates({ from: '2026-02-30' })).toThrow(
      'from must be YYYY-MM-DD',
    );
  });

  it('groups assessment and practice results into the same Cairo day', async () => {
    const subjectService = new PerformanceService(
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(
        subjectService as unknown as { dataset: () => Promise<unknown> },
        'dataset',
      )
      .mockResolvedValue({
        eligibleIds: [],
        activities: [
          activity(
            'assessment',
            'ASSESSMENT',
            'CORRECT',
            new Date('2026-10-12T21:30:00Z'),
          ),
          activity(
            'practice',
            'PRACTICE',
            'INCORRECT',
            new Date('2026-10-13T08:00:00Z'),
          ),
        ],
      });
    const result = await subjectService.trends('student', {});
    expect(result.data).toEqual([
      expect.objectContaining({
        date: '2026-10-13',
        total: 2,
        answered: 2,
        accuracyPercent: 50,
        sources: {
          assessment: expect.objectContaining({ total: 1 }) as unknown,
          practice: expect.objectContaining({ total: 1 }) as unknown,
        },
      }),
    ]);
  });
});
