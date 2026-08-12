import { LearningService } from './learning.service';
import { AssessmentQuestionOutcome } from '../../common/types/roles.enum';

describe('LearningService parent analytics metrics', () => {
  const service = new LearningService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('uses score, accuracy, and omission definitions independently', () => {
    const result = (service as any).assessmentMetrics([
      {
        attemptId: 'a',
        outcome: AssessmentQuestionOutcome.CORRECT,
        attempt: { submittedAt: new Date('2026-08-01T10:00:00.000Z') },
      },
      {
        attemptId: 'a',
        outcome: AssessmentQuestionOutcome.INCORRECT,
        attempt: { submittedAt: new Date('2026-08-01T10:00:00.000Z') },
      },
      {
        attemptId: 'b',
        outcome: AssessmentQuestionOutcome.OMITTED,
        attempt: { submittedAt: new Date('2026-08-02T10:00:00.000Z') },
      },
    ]);

    expect(result).toEqual({
      completedAssessments: 2,
      correct: 1,
      incorrect: 1,
      omitted: 1,
      scorePercent: 33.3,
      accuracyPercent: 50,
      omissionPercent: 33.3,
      lastCompletedAt: new Date('2026-08-02T10:00:00.000Z'),
    });
  });

  it('derives first-attempt and retry recovery from immutable attempts', () => {
    const result = (service as any).practiceMetrics([
      {
        questionId: 'retry',
        attemptNumber: 1,
        isCorrect: false,
        submittedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
      {
        questionId: 'retry',
        attemptNumber: 2,
        isCorrect: true,
        submittedAt: new Date('2026-08-01T10:01:00.000Z'),
      },
      {
        questionId: 'first',
        attemptNumber: 1,
        isCorrect: true,
        submittedAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    ]);

    expect(result).toEqual({
      uniqueQuestionsAttempted: 2,
      totalAttempts: 3,
      correctAttempts: 2,
      attemptAccuracyPercent: 66.7,
      firstAttemptCorrectQuestions: 1,
      solvedAfterRetryQuestions: 1,
      lastActivityAt: new Date('2026-08-02T10:00:00.000Z'),
    });
  });

  it('returns null ratios when no activity exists', () => {
    expect((service as any).assessmentMetrics([])).toMatchObject({
      scorePercent: null,
      accuracyPercent: null,
      omissionPercent: null,
      lastCompletedAt: null,
    });
    expect((service as any).practiceMetrics([])).toMatchObject({
      attemptAccuracyPercent: null,
      lastActivityAt: null,
    });
  });
});
