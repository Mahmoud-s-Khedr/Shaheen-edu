import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '../../common/types/roles.enum';
import { QuestionAiExplanationsService } from './question-ai-explanations.service';

describe('QuestionAiExplanationsService answer validation', () => {
  const service = new QuestionAiExplanationsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  // This validator also receives AI output, which bypasses request DTO validation.
  it.each([123, null, {}, ' '])(
    'rejects malformed written answer %j without throwing a TypeError',
    (answer) => {
      expect(() =>
        service['validAnswer'](QuestionType.SHORT_ANSWER, {
          acceptedAnswers: [answer],
        }),
      ).toThrow(
        new BadRequestException(
          'acceptedAnswers must contain only non-blank text answers',
        ),
      );
    },
  );

  it.each([-1, 0.5, '0', null, {}])(
    'rejects malformed choice index %j',
    (index) => {
      expect(() =>
        service['validAnswer'](QuestionType.SINGLE_CHOICE, {
          selectedOptionIndexes: [index],
        }),
      ).toThrow(
        new BadRequestException(
          'selectedOptionIndexes must contain only non-negative whole numbers',
        ),
      );
    },
  );

  it('preserves trimming and deduplication of valid written answers', () => {
    expect(
      service['validAnswer'](QuestionType.SHORT_ANSWER, {
        acceptedAnswers: [' 42 ', '42'],
      }),
    ).toEqual({
      selectedOptionIndexes: null,
      acceptedAnswers: ['42'],
      gradingRubric: null,
    });
  });
});
