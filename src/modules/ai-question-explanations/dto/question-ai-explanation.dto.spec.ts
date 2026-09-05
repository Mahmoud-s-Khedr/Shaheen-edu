import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuestionAiExplanationRunMode } from '../../../common/types/roles.enum';
import { CreateAiQuestionExplanationRunDto } from './question-ai-explanation.dto';

describe('CreateAiQuestionExplanationRunDto', () => {
  it.each([
    { acceptedAnswers: [123] },
    { selectedOptionIndexes: [-1] },
    { selectedOptionIndexes: [0.5] },
    { gradingRubric: 123 },
  ])('validates the nested supplied answer: %j', async (suppliedAnswer) => {
    const dto = plainToInstance(CreateAiQuestionExplanationRunDto, {
      mode: QuestionAiExplanationRunMode.GROUNDED,
      suppliedAnswer,
    });
    const errors = await validate(dto);
    expect(errors).toEqual([
      expect.objectContaining({
        property: 'suppliedAnswer',
        children: expect.arrayContaining([
          expect.objectContaining({ property: Object.keys(suppliedAnswer)[0] }),
        ]),
      }),
    ]);
  });

  it('accepts a valid nested answer', async () => {
    const dto = plainToInstance(CreateAiQuestionExplanationRunDto, {
      mode: QuestionAiExplanationRunMode.GROUNDED,
      suppliedAnswer: { acceptedAnswers: ['42'] },
    });
    expect(await validate(dto)).toEqual([]);
  });
});
