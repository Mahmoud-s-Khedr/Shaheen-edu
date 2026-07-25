import { toStudentQuestionDto } from './question-representation';

describe('toStudentQuestionDto', () => {
  it('omits answer, explanation, and review fields', () => {
    const result = toStudentQuestionDto({
      id: 'question-1', type: 'SINGLE_CHOICE', body: 'What is 2 + 2?', explanation: 'Arithmetic', status: 'PUBLISHED', reviewNote: 'ok',
      scope: { chapterId: 'chapter-1' }, options: [{ id: 'a', body: '4', isCorrect: true, sortOrder: 1 }],
      assets: [], videoLink: null,
    });
    expect(result).toEqual({ id: 'question-1', type: 'SINGLE_CHOICE', body: 'What is 2 + 2?', scope: { chapterId: 'chapter-1' }, options: [{ id: 'a', body: '4', sortOrder: 1 }], assets: [], videoTimestampSeconds: null });
    expect(JSON.stringify(result)).not.toContain('isCorrect');
    expect(JSON.stringify(result)).not.toContain('explanation');
    expect(JSON.stringify(result)).not.toContain('reviewNote');
  });
});
