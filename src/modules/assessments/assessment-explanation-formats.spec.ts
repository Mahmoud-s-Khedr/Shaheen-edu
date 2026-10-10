import { AssessmentsService } from './assessments.service';
import {
  explanationPersistence,
  QuestionExplanationFormat as Format,
} from '../../common/utils/structured-explanation';
import {
  AssessmentAttemptStatus,
  AssessmentGenerationType,
  AssessmentMode,
  AssessmentOwnerType,
  AssessmentStatus,
  QuestionType,
} from '../../common/types/roles.enum';
const written = {
  answerElements: 'Required answer',
  scientificExplanation: 'Supporting law',
  commonMistakes: 'Omissions',
  whatIf: 'Change assumptions',
};

describe('Assessment explanation formats', () => {
  it.each([Format.WRITTEN_FOUR_SECTION, Format.SIX_SECTION])(
    'freezes %s separately from immutable content and grading criteria',
    async (format) => {
      const service = Object.create(
        AssessmentsService.prototype,
      ) as AssessmentsService;
      jest
        .spyOn(service as any, 'inferAssessmentSubjectId')
        .mockResolvedValue('subject');
      const content =
        format === Format.WRITTEN_FOUR_SECTION
          ? written
          : {
              keywords: 'k',
              eliminationStrategy: 's',
              whyCorrect: 'r',
              generalRule: 'g',
              commonMistakes: 'm',
              whatIf: 'w',
            };
      const question = {
        id: 'source',
        type: QuestionType.LONG_ANSWER,
        body: 'Explain.',
        maxPoints: 5,
        gradingRubric: 'Two elements: 2 marks and 3 marks.',
        acceptedAnswers: null,
        structuredExplanation: {
          ...explanationPersistence(content, format),
          languageCode: 'en',
          origin: 'HUMAN',
        },
        options: [],
        placements: [],
        contentBlocks: [],
        assets: [],
        contexts: [],
      };
      const tx = {
        assessment: {
          create: jest.fn().mockResolvedValue({ id: 'assessment' }),
        },
        questionSource: { findUnique: jest.fn().mockResolvedValue(null) },
        assessmentQuestion: {
          create: jest.fn().mockResolvedValue({ id: 'snapshot' }),
        },
      };
      await service['freezeSnapshot'](tx, {
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId: 'student',
        title: 'Assessment',
        generationType: AssessmentGenerationType.STANDARD,
        mode: AssessmentMode.EXAM,
        isTimed: false,
        status: AssessmentStatus.READY,
        scopes: [],
        questions: [question],
      });
      const snapshot = tx.assessmentQuestion.create.mock.calls[0][0].data;
      expect(snapshot).toMatchObject({
        maxPoints: 5,
        gradingRubric: question.gradingRubric,
        structuredExplanationFormat: format,
        structuredExplanation: { ...content, languageCode: 'en' },
      });
      expect(snapshot.structuredExplanation).not.toHaveProperty(
        'structuredExplanationFormat',
      );
      question.structuredExplanation.commonMistakes = 'Later edit';
      question.gradingRubric = 'Later rubric';
      question.maxPoints = 9;
      expect(snapshot.structuredExplanation.commonMistakes).toBe(
        content.commonMistakes,
      );
      expect(snapshot.maxPoints).toBe(5);
      expect(snapshot.gradingRubric).toBe('Two elements: 2 marks and 3 marks.');
    },
  );

  it.each([
    [AssessmentMode.EXAM, AssessmentAttemptStatus.SUSPENDED, false, false],
    [AssessmentMode.TUTOR, AssessmentAttemptStatus.SUSPENDED, false, false],
    [AssessmentMode.TUTOR, AssessmentAttemptStatus.SUSPENDED, true, true],
    [AssessmentMode.EXAM, AssessmentAttemptStatus.COMPLETED, false, true],
  ] as const)(
    'respects visibility for %s / %s / answered=%s',
    async (mode, status, answered, visible) => {
      const service = Object.create(
        AssessmentsService.prototype,
      ) as AssessmentsService;
      Object.assign(service, {
        prisma: {
          assessmentAttemptAnswer: {
            findMany: jest
              .fn()
              .mockResolvedValue(
                answered
                  ? [
                      {
                        assessmentQuestionId: 'snapshot',
                        selectedOptionIds: [],
                        responseText: 'Answer',
                        aiGradingRuns: [],
                        responseVersion: 1,
                      },
                    ]
                  : [],
              ),
          },
        },
      });
      jest
        .spyOn(service as any, 'ensureNotExpired')
        .mockImplementation(async (value) => value);
      jest
        .spyOn(service as any, 'questionsForAssessment')
        .mockResolvedValue([
          {
            id: 'snapshot',
            sourceQuestionId: 'source',
            maxPoints: 5,
            options: [],
            structuredExplanationFormat: Format.WRITTEN_FOUR_SECTION,
            structuredExplanation: { ...written, languageCode: 'en' },
          },
        ]);
      jest
        .spyOn(service as any, 'markedQuestionIds')
        .mockResolvedValue(new Set());
      jest
        .spyOn(service as any, 'questionNotesByQuestionId')
        .mockResolvedValue(new Map());
      const state = await service['attemptStateDto'](
        {
          id: 'attempt',
          studentUserId: 'student',
          status,
          score: 0,
          totalPoints: 5,
        },
        { id: 'assessment', mode },
      );
      const question = state.questions[0];
      if (visible) {
        expect(question.structuredExplanationFormat).toBe(
          Format.WRITTEN_FOUR_SECTION,
        );
        expect(question.structuredExplanation).toMatchObject(written);
        expect(question.explanation).toContain(
          'Answer elements: Required answer',
        );
      } else {
        expect(question.structuredExplanationFormat).toBeNull();
        expect(question.structuredExplanation).toBeNull();
        expect(question.explanation).toBeNull();
      }
    },
  );
});
