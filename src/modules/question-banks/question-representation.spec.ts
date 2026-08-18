import { toStudentQuestionDto } from './question-representation';

describe('toStudentQuestionDto', () => {
  it('omits answer, explanation, and review fields', () => {
    const result = toStudentQuestionDto({
      id: 'question-1',
      type: 'SINGLE_CHOICE',
      body: 'What is 2 + 2?',
      explanation: 'Arithmetic',
      status: 'PUBLISHED',
      reviewNote: 'ok',
      scope: { chapterId: 'chapter-1' },
      options: [{ id: 'a', body: '4', isCorrect: true, sortOrder: 1 }],
      assets: [],
      videoLink: {
        videoAssetId: 'video-1',
        timestampSeconds: 42,
        videoAsset: { asset: { filename: 'lesson.mp4' } },
      },
    });
    expect(result).toEqual({
      id: 'question-1',
      type: 'SINGLE_CHOICE',
      body: 'What is 2 + 2?',
      contentBlocks: [],
      scope: { chapterId: 'chapter-1' },
      options: [{ id: 'a', body: '4', contentBlocks: [], sortOrder: 1 }],
      assets: [],
      video: {
        assetId: 'video-1',
        assetName: 'lesson.mp4',
        timestampSeconds: 42,
      },
    });
    expect(JSON.stringify(result)).not.toContain('isCorrect');
    expect(JSON.stringify(result)).not.toContain('explanation');
    expect(JSON.stringify(result)).not.toContain('reviewNote');
  });

  it('delivers ordered option content without answer-key fields', () => {
    const result = toStudentQuestionDto({
      id: 'question-2',
      type: 'SINGLE_CHOICE',
      body: '[Content]',
      scope: {},
      contentBlocks: [
        {
          id: 'block-1',
          questionId: 'question-2',
          type: 'IMAGE',
          sortOrder: 1,
          asset: { id: 'image-1', kind: 'IMAGE', filename: 'diagram.png' },
        },
      ],
      options: [
        {
          id: 'a',
          body: 'A',
          isCorrect: true,
          sortOrder: 1,
          contentBlocks: [{ type: 'EQUATION', sortOrder: 1, latex: 'x^2' }],
        },
      ],
      assets: [],
    });
    expect(result.contentBlocks).toEqual([
      expect.objectContaining({
        type: 'IMAGE',
        asset: { id: 'image-1', kind: 'IMAGE', filename: 'diagram.png' },
      }),
    ]);
    expect(result.options[0].contentBlocks).toEqual([
      expect.objectContaining({ type: 'EQUATION', latex: 'x^2' }),
    ]);
    expect(JSON.stringify(result)).not.toContain('isCorrect');
    expect(JSON.stringify(result.contentBlocks[0])).not.toContain('questionId');
  });
});
