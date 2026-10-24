import { QuestionType } from '../../common/types/roles.enum';
import { LearningService } from './learning.service';

describe('LearningService practice attempts', () => {
  it('returns structured sections and additional text after a practice answer', async () => {
    const prisma: any = {
      studentQuestionAttempt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'attempt-1',
          attemptNumber: 1,
          submittedAt: new Date('2026-01-01'),
        }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    const service = new LearningService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      { recordResponse: jest.fn() } as any,
      {} as any,
    );
    jest.spyOn(service as any, 'practiceQuestions').mockResolvedValue([
      {
        id: 'question-1',
        type: QuestionType.SINGLE_CHOICE,
        moreExplanation: 'Choose the matching unit.',
        structuredExplanation: {
          languageCode: 'en',
          keywords: 'units',
          whyCorrect: 'The units match.',
        },
        options: [
          { id: 'option-1', isCorrect: true },
          { id: 'option-2', isCorrect: false },
        ],
      },
    ]);

    const result = await service.attempt('student-1', 'question-1', [
      'option-1',
    ]);
    expect(result).not.toHaveProperty('explanation');
    expect(result).toMatchObject({
      moreExplanation: 'Choose the matching unit.',
      structuredExplanation: {
        keywords: 'units',
        whyCorrect: 'The units match.',
      },
    });
  });
});
