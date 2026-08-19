import { QuestionImportStatus } from '../../common/types/roles.enum';
import { QuestionImportService } from './question-import.service';

describe('QuestionImportService review summaries', () => {
  function serviceWith() {
    return new QuestionImportService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue({ questionImportModel: 'test-model' }) } as any,
    );
  }

  it('clears a completed-with-errors summary when every review item is resolved', async () => {
    const service = serviceWith();
    const tx = {
      questionImportItem: {
        count: jest.fn()
          .mockResolvedValueOnce(3) // created
          .mockResolvedValueOnce(0) // invalid
          .mockResolvedValueOnce(0) // review required
          .mockResolvedValueOnce(1), // excluded
      },
      questionImportChunk: {
        count: jest.fn()
          .mockResolvedValueOnce(0) // failed
          .mockResolvedValueOnce(0) // unfinished
          .mockResolvedValueOnce(2), // completed
      },
      questionImportBatch: { update: jest.fn() },
    };

    await (service as any).refreshReviewSummary(tx, 'batch-1');

    expect(tx.questionImportBatch.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'batch-1' },
      data: expect.objectContaining({
        status: QuestionImportStatus.COMPLETED,
        totalItems: 4,
        createdQuestions: 3,
        invalidItems: 0,
        failedItems: 0,
        errorSummary: null,
      }),
    }));
  });
});
