import { QuestionType, Role } from '../../common/types/roles.enum';
import { QuestionBanksService } from './question-banks.service';

const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
const types = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.SHORT_ANSWER,
  QuestionType.FILL_IN_THE_BLANK,
  QuestionType.LONG_ANSWER,
];

function setup() {
  const client = {
    question: {
      create: jest.fn(async ({ data }) => ({
        id: 'question',
        status: 'DRAFT',
        ...data,
      })),
    },
  };
  const service = new QuestionBanksService(
    {} as any,
    { recordWithClient: jest.fn() } as any,
  );
  return { service, client };
}

function draft(type: QuestionType) {
  return {
    courseId: 'course',
    placements: [],
    bankId: 'bank',
    sourceId: 'source',
    body: 'Question',
    type,
    options:
      type === QuestionType.SINGLE_CHOICE ||
      type === QuestionType.MULTIPLE_CHOICE
        ? [{ body: 'A' }, { body: 'B' }]
        : [],
  };
}

describe('Extracted question drafts', () => {
  it.each(types)('creates an answerless %s draft', async (type) => {
    const { service, client } = setup();
    const question = await service.createExtractedDraftWithClient(
      actor,
      draft(type),
      client as any,
      [],
    );
    expect(question.status).toBe('DRAFT');
    const data = client.question.create.mock.calls[0][0].data;
    for (const field of [
      'acceptedAnswers',
      'gradingRubric',
      'explanation',
      'answerOrigin',
      'structuredExplanation',
    ])
      expect(data[field]).toBeUndefined();
    expect(data.answerReviewedAt).toBeNull();
    expect(
      data.options?.create?.every(
        (option: any) => option.isCorrect === false,
      ) ?? true,
    ).toBe(true);
  });

  it.each([
    QuestionType.SINGLE_CHOICE,
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.SHORT_ANSWER,
    QuestionType.FILL_IN_THE_BLANK,
  ])('keeps ordinary imported %s answer validation strict', async (type) => {
    const { service, client } = setup();
    await expect(
      service.createImportedDraftWithClient(
        actor,
        {
          ...draft(type),
          options: draft(type).options.map((option) => ({
            ...option,
            isCorrect: false,
          })),
        },
        client as any,
        [],
      ),
    ).rejects.toThrow('Imported question does not satisfy its answer type');
    expect(client.question.create).not.toHaveBeenCalled();
  });

  it('still requires at least two options for an extracted choice draft', async () => {
    const { service, client } = setup();
    await expect(
      service.createExtractedDraftWithClient(
        actor,
        {
          ...draft(QuestionType.SINGLE_CHOICE),
          options: [{ body: 'A' }],
        },
        client as any,
        [],
      ),
    ).rejects.toThrow('Imported question does not satisfy its answer type');
  });

  it.each(types)(
    'prevents publishing answerless %s even with a manual explanation',
    async (type) => {
      const { service } = setup();
      await expect(
        service['validate']({
          ...draft(type),
          explanation: 'Manual explanation',
          maxPoints: 1,
          bank: { status: 'PUBLISHED' },
          source: { status: 'PUBLISHED' },
          options: draft(type).options.map((option) => ({
            ...option,
            isCorrect: false,
          })),
        } as any),
      ).rejects.toThrow();
    },
  );
});

it.each(types)(
  'allows normal publication validation with a manually supplied %s answer and explanation',
  async (type) => {
    const { service } = setup();
    const choice =
      type === QuestionType.SINGLE_CHOICE ||
      type === QuestionType.MULTIPLE_CHOICE;
    const question = {
      ...draft(type),
      explanation: 'Manual explanation',
      maxPoints: 1,
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
            { body: 'A', isCorrect: true, contentBlocks: [] },
            {
              body: 'B',
              isCorrect: type === QuestionType.MULTIPLE_CHOICE,
              contentBlocks: [],
            },
          ]
        : [],
      acceptedAnswers: ['42'],
      gradingRubric: 'Explain the mechanism.',
    };
    await expect(service['validate'](question as any)).resolves.toBeUndefined();
  },
);
