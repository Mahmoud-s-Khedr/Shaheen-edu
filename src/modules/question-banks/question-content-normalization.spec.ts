import { QuestionContentBlockType } from '../../common/types/roles.enum';
import { Role } from '../../common/types/roles.enum';
import { QuestionBanksService } from './question-banks.service';

describe('QuestionBanksService content normalization', () => {
  const service = new QuestionBanksService(
    { asset: { findUnique: jest.fn() } } as never,
    {} as never,
  );

  it('prepends a supplied legacy body to canonical blocks', async () => {
    const result = await (service as any).normalizedBlocks('Intro', [
      { type: QuestionContentBlockType.EQUATION, latex: 'x^2' },
    ]);

    expect(result.body).toBe('Intro\n\nx^2');
    expect(result.rows).toEqual([
      expect.objectContaining({
        type: QuestionContentBlockType.TEXT,
        text: 'Intro',
      }),
      expect.objectContaining({
        type: QuestionContentBlockType.EQUATION,
        latex: 'x^2',
      }),
    ]);
  });

  it('accepts an explicit empty sequence only when clearing is allowed', async () => {
    await expect(
      (service as any).normalizedBlocks(undefined, []),
    ).rejects.toThrow('A body or contentBlocks is required');

    await expect(
      (service as any).normalizedBlocks(undefined, [], true),
    ).resolves.toEqual({ body: '', rows: [] });
  });

  it('creates canonical blocks and legacy attachments in the same transaction', async () => {
    const tx = {
      question: { create: jest.fn().mockResolvedValue({ id: 'question-1' }) },
      questionAsset: { deleteMany: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const created = new QuestionBanksService(
      prisma as never,
      { record: jest.fn() } as never,
    );
    Object.assign(created as any, {
      source: jest.fn(),
      bank: jest.fn(),
      course: jest.fn(),
      assertBankCourseSubject: jest.fn(),
      placementData: jest.fn().mockResolvedValue([]),
      contextLinks: jest.fn().mockResolvedValue([]),
      normalizedBlocks: jest.fn().mockResolvedValue({
        body: '[Content]',
        rows: [{ assetId: 'asset-1', asset: { kind: 'IMAGE' } }],
      }),
      getQuestion: jest.fn().mockResolvedValue({ id: 'question-1' }),
    });

    await created.createQuestion(
      { id: 'admin-1', role: Role.ADMIN, sessionId: 'session-1' },
      {
        bankId: 'bank-1',
        sourceId: 'source-1',
        courseId: 'course-1',
        placements: [],
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.question.create).toHaveBeenCalledTimes(1);
    expect(tx.questionAsset.create).toHaveBeenCalledWith({
      data: { questionId: 'question-1', assetId: 'asset-1', sortOrder: 1 },
    });
  });

  it('loads media assets in one batch and does not project downloadable files', async () => {
    const prisma = {
      asset: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'download-1', kind: 'DOWNLOADABLE_FILE', status: 'READY' },
          { id: 'image-1', kind: 'IMAGE', status: 'READY' },
        ]),
      },
    };
    const normalized = new QuestionBanksService(prisma as never, {} as never);

    const result = await (normalized as any).normalizedBlocks(undefined, [
      { type: QuestionContentBlockType.ASSET, assetId: 'download-1' },
      { type: QuestionContentBlockType.IMAGE, assetId: 'image-1' },
    ]);

    expect(prisma.asset.findMany).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(2);
    const tx = { questionAsset: { deleteMany: jest.fn(), create: jest.fn() } };
    await (normalized as any).syncQuestionAssets(tx, 'question-1', result.rows);
    expect(tx.questionAsset.create).toHaveBeenCalledTimes(1);
    expect(tx.questionAsset.create).toHaveBeenCalledWith({
      data: { questionId: 'question-1', assetId: 'image-1', sortOrder: 1 },
    });
  });

  it('rejects body-only edits that would replace mixed content', () => {
    expect(() =>
      (service as any).rejectUnsafeLegacyBodyUpdate('replacement', undefined, [
        { type: QuestionContentBlockType.TEXT },
        { type: QuestionContentBlockType.EQUATION },
      ]),
    ).toThrow(
      'Mixed content must be updated with an explicit contentBlocks payload',
    );

    expect(() =>
      (service as any).rejectUnsafeLegacyBodyUpdate('replacement', undefined, [
        { type: QuestionContentBlockType.TEXT },
      ]),
    ).not.toThrow();
  });

  it('enforces the content block and table resource limits', async () => {
    await expect(
      (service as any).normalizedBlocks(
        undefined,
        Array.from({ length: 101 }, () => ({
          type: QuestionContentBlockType.TEXT,
          text: 'text',
        })),
      ),
    ).rejects.toThrow('Content cannot contain more than 100 blocks');

    await expect(
      (service as any).normalizedBlocks(undefined, [
        {
          type: QuestionContentBlockType.TABLE,
          tableData: {
            headerRow: true,
            cells: Array.from({ length: 51 }, () => ['cell']),
          },
        },
      ]),
    ).rejects.toThrow('Table blocks require a rectangular cell matrix');
  });
});
