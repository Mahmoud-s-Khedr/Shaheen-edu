import { QuestionType } from '../../common/types/roles.enum';
import { LearningService } from './learning.service';

describe('LearningService practice attempts', () => {
  it('returns the compatibility-formatted explanation after a practice answer', async () => {
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
        explanation: 'Choose the matching unit.',
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

    await expect(
      service.attempt('student-1', 'question-1', ['option-1']),
    ).resolves.toMatchObject({
      explanation:
        'Choose the matching unit.\n\nKeywords: units\n\nWhy this is correct: The units match.',
    });
  });
});
