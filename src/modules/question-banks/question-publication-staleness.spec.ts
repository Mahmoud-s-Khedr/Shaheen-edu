import { QuestionBanksService } from './question-banks.service';
import {
  QuestionType,
  QuestionStatus,
  Role,
} from '../../common/types/roles.enum';

const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
const types = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.SHORT_ANSWER,
  QuestionType.FILL_IN_THE_BLANK,
  QuestionType.LONG_ANSWER,
];

function setup(
  type: QuestionType,
  status: QuestionStatus = QuestionStatus.DRAFT,
) {
  const choice =
    type === QuestionType.SINGLE_CHOICE ||
    type === QuestionType.MULTIPLE_CHOICE;
  const question = {
    id: 'question',
    status,
    type,
    body: 'Question',
    explanation: 'Explanation',
    maxPoints: 1,
    structuredExplanation: { staleAt: new Date('2026-09-01T00:00:00Z') },
    bank: { status: 'PUBLISHED' },
    source: { status: 'PUBLISHED' },
    course: { status: 'PUBLISHED', subject: { status: 'PUBLISHED' } },
    placements: [{}],
    assets: [],
    contentBlocks: [],
    contexts: [],
    answerOrigin: 'HUMAN_REVIEWED',
    options: choice
      ? [
          { isCorrect: true, contentBlocks: [] },
          {
            isCorrect: type === QuestionType.MULTIPLE_CHOICE,
            contentBlocks: [],
          },
        ]
      : [],
    acceptedAnswers: choice || type === QuestionType.LONG_ANSWER ? [] : ['42'],
    gradingRubric:
      type === QuestionType.LONG_ANSWER ? 'Explain the mechanism.' : null,
  };
  const tx = { question: { update: jest.fn().mockResolvedValue(question) } };
  const prisma = { ...tx, $transaction: jest.fn(async (fn) => fn(tx)) };
  const service = new QuestionBanksService(
    prisma as any,
    { record: jest.fn(), recordWithClient: jest.fn() } as any,
  );
  Object.assign(service, {
    questionWithClient: jest.fn().mockResolvedValue(question),
    getQuestion: jest.fn().mockResolvedValue(question),
  });
  return { service, tx, question };
}

describe('Explanation staleness is advisory during publication', () => {
  it.each(types)(
    'bulk publishes a complete %s with a stale explanation',
    async (type) => {
      const { service, tx } = setup(type);
      await expect(
        service.bulkPublishQuestions(actor, ['question']),
      ).resolves.toEqual({ publishedIds: ['question'], failed: [] });
      expect(tx.question.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    },
  );

  it.each(types)(
    'allows a complete %s to enter review with a stale explanation',
    async (type) => {
      const { service, tx } = setup(type);
      await service.submit(actor, 'question');
      expect(tx.question.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_REVIEW' }),
        }),
      );
    },
  );

  it.each(types)(
    'publishes a complete in-review %s with a stale explanation',
    async (type) => {
      const { service, tx } = setup(type, QuestionStatus.IN_REVIEW);
      await service.publishQuestion(actor, 'question');
      expect(tx.question.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    },
  );

  it.each(types)(
    'still rejects %s when its required answer is missing',
    async (type) => {
      const { service, tx, question } = setup(type);
      question.options.forEach((option) => {
        option.isCorrect = false;
      });
      question.acceptedAnswers = [];
      question.gradingRubric = null;
      const result = await service.bulkPublishQuestions(actor, ['question']);
      expect(result.publishedIds).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].reason).not.toContain('stale');
      expect(tx.question.update).not.toHaveBeenCalled();
    },
  );
});
