import { LearningService } from './learning.service';

describe('LearningService practice content blocks', () => {
  it('does not expose asset storage internals in question, option, or context blocks', () => {
    const service = new LearningService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const asset = {
      id: 'asset-1',
      kind: 'IMAGE',
      filename: 'diagram.png',
      storageKey: 'private/diagram.png',
      metadata: { origin: 'upload' },
      uploadedById: 'admin-1',
      createdAt: new Date(),
    };

    const result = (service as any).learnerQuestion({
      id: 'question-1',
      type: 'SINGLE_CHOICE',
      body: '[Content]',
      contentBlocks: [{ id: 'question-block', type: 'IMAGE', asset }],
      options: [
        {
          id: 'option-1',
          body: 'A',
          sortOrder: 1,
          contentBlocks: [{ id: 'option-block', type: 'IMAGE', asset }],
        },
      ],
      contexts: [
        {
          context: {
            id: 'context-1',
            body: '[Content]',
            sourceLocator: { page: 3 },
            contentBlocks: [{ id: 'context-block', type: 'IMAGE', asset }],
          },
        },
      ],
      placements: [],
      assets: [],
      videoLink: null,
    });

    for (const block of [
      result.contentBlocks[0],
      result.options[0].contentBlocks[0],
      result.contexts[0].contentBlocks[0],
    ]) {
      expect(block.asset).toEqual({
        id: 'asset-1',
        kind: 'IMAGE',
        filename: 'diagram.png',
      });
      expect(JSON.stringify(block)).not.toContain('storageKey');
      expect(JSON.stringify(block)).not.toContain('uploadedById');
    }
    expect(JSON.stringify(result.contexts[0])).not.toContain('sourceLocator');
  });
});
