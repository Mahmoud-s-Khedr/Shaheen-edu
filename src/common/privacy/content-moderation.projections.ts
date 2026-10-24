/** Allowlisted workflow responses: database relations must never be spread here. */
function fields(record: any, keys: readonly string[]): Record<string, any> {
  return Object.fromEntries(
    keys
      .filter((key) => record?.[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
}

export function contentQuestionReport(report: any) {
  return {
    ...fields(report, [
      'id',
      'questionId',
      'type',
      'note',
      'status',
      'resolutionNote',
      'resolvedAt',
      'createdAt',
      'updatedAt',
    ]),
    ...(report.question
      ? { question: fields(report.question, ['id', 'body']) }
      : {}),
    ...(report.questionSnapshot
      ? {
          questionSnapshot: fields(report.questionSnapshot, [
            'id',
            'body',
            'type',
            'moreExplanation',
            'structuredExplanation',
            'structuredExplanationFormat',
            'updatedAt',
          ]),
        }
      : {}),
    ...(report._count ? { _count: fields(report._count, ['actions']) } : {}),
  };
}

export function contentGradingAnswer(answer: any) {
  return {
    ...fields(answer, [
      'id',
      'attemptId',
      'assessmentQuestionId',
      'selectedOptionIds',
      'responseText',
      'responseVersion',
      'inputMethod',
      'responseLanguageCode',
      'isCorrect',
      'outcome',
      'awardedPoints',
      'gradedAt',
      'graderFeedback',
      'activeSeconds',
      'answeredAt',
      'updatedAt',
    ]),
    ...(answer.attempt
      ? {
          attempt: {
            ...fields(answer.attempt, [
              'id',
              'assessmentId',
              'status',
              'startedAt',
              'submittedAt',
              'completedAt',
            ]),
            ...(answer.attempt.assessment
              ? {
                  assessment: fields(answer.attempt.assessment, [
                    'id',
                    'title',
                  ]),
                }
              : {}),
          },
        }
      : {}),
    ...(answer.assessmentQuestion
      ? {
          assessmentQuestion: fields(answer.assessmentQuestion, [
            'id',
            'assessmentId',
            'sourceQuestionId',
            'sortOrder',
            'type',
            'body',
            'moreExplanation',
            'maxPoints',
            'acceptedAnswers',
            'gradingRubric',
            'answerOrigin',
            'videoAssetId',
            'videoAssetName',
            'timestampSeconds',
            'structuredExplanationFormat',
            'structuredExplanation',
          ]),
        }
      : {}),
    ...(answer.aiGradingRuns
      ? {
          aiGradingRuns: answer.aiGradingRuns.map((run: any) =>
            fields(run, [
              'id',
              'status',
              'responseVersion',
              'responseLanguageCode',
              'proposedPoints',
              'proposedOutcome',
              'feedback',
              'model',
              'createdAt',
              'completedAt',
            ]),
          ),
        }
      : {}),
  };
}
