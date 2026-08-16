import { toStudentQuestionDto } from './question-representation';

describe('toStudentQuestionDto', () => {
  it('omits answer, explanation, and review fields', () => {
    const result = toStudentQuestionDto({
      id: 'question-1', type: 'SINGLE_CHOICE', body: 'What is 2 + 2?', explanation: 'Arithmetic', status: 'PUBLISHED', reviewNote: 'ok',
      scope: { chapterId: 'chapter-1' }, options: [{ id: 'a', body: '4', isCorrect: true, sortOrder: 1 }],
      assets: [], videoLink: { videoAssetId: 'video-1', timestampSeconds: 42, videoAsset: { asset: { filename: 'lesson.mp4' } } },
    });
    expect(result).toEqual({ id: 'question-1', type: 'SINGLE_CHOICE', body: 'What is 2 + 2?', scope: { chapterId: 'chapter-1' }, options: [{ id: 'a', body: '4', sortOrder: 1 }], assets: [], video: { assetId: 'video-1', assetName: 'lesson.mp4', timestampSeconds: 42 } });
    expect(JSON.stringify(result)).not.toContain('isCorrect');
    expect(JSON.stringify(result)).not.toContain('explanation');
    expect(JSON.stringify(result)).not.toContain('reviewNote');
  });
});
