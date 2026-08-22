import sharp from 'sharp';
import { QuestionImportMediaService } from './question-import-media.service';

describe('QuestionImportMediaService', () => {
  function serviceWith() {
    const tx = {
      questionImportMedia: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'media-1', mediaKey: 'M-test' }),
        update: jest.fn(),
      },
      questionImportMediaDetection: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      questionImportMedia: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'media-1' }),
      },
      questionImportMediaDetection: { create: jest.fn() },
      asset: { create: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const storage = { upload: jest.fn(), delete: jest.fn() };
    const assets = { archiveIfUnreferenced: jest.fn() };
    return {
      service: new QuestionImportMediaService(
        prisma as any,
        storage as any,
        assets as any,
      ),
      prisma,
      storage,
      tx,
      assets,
    };
  }

  it('flags page-edge proposals and rejects malformed bounds', () => {
    const { service } = serviceWith();
    expect(
      (service as any).validate(
        { left: 0, top: 50, right: 500, bottom: 500 },
        1000,
        1000,
        [],
      ).flags,
    ).toContain('touches_page_edge');
    expect(
      (service as any).validate(
        { left: 400, top: 100, right: 300, bottom: 200 },
        1000,
        1000,
        [],
      ).valid,
    ).toBe(false);
  });

  it('collapses overlapping region proposals into one crop while retaining every detection', async () => {
    const { service, prisma, storage, tx } = serviceWith();
    prisma.questionImportMedia.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'media-1',
          normalizedBounds: { left: 100, top: 100, right: 500, bottom: 500 },
        },
      ]);
    const page = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await service.materializePage(
      { id: 'batch-1', createdById: 'admin-1' },
      1,
      page,
      [
        {
          type: 'DIAGRAM',
          bounds: { left: 100, top: 100, right: 500, bottom: 500 },
          confidence: 0.96,
          description: 'A diagram',
          warnings: [],
        },
        {
          type: 'DIAGRAM',
          bounds: { left: 102, top: 102, right: 498, bottom: 498 },
          confidence: 0.92,
          description: 'Duplicate diagram',
          warnings: [],
        },
      ],
      { response: true },
    );

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(prisma.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'IMAGE',
          status: 'READY',
          mimeType: 'image/png',
        }),
      }),
    );
    expect(tx.questionImportMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaKey: expect.stringMatching(/^M-[0-9a-f-]{36}$/),
          status: 'ELIGIBLE',
          pageNumber: 1,
        }),
      }),
    );
    expect(tx.questionImportMediaDetection.create).toHaveBeenCalledTimes(1);
    expect(prisma.questionImportMediaDetection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'AI',
          accepted: false,
          description: 'Duplicate diagram',
        }),
      }),
    );
  });

  it('records manually created crops with their admin provenance', async () => {
    const { service, tx } = serviceWith();
    const page = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();

    await service.createManualRegion(
      { id: 'batch-1', createdById: 'admin-1' },
      1,
      page,
      {
        type: 'DIAGRAM',
        bounds: { left: 100, top: 100, right: 500, bottom: 500 },
        confidence: 1,
        description: 'Admin crop',
        warnings: [],
      },
      'admin-2',
    );

    expect(tx.questionImportMediaDetection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'MANUAL',
          createdById: 'admin-2',
          rawEvidence: null,
        }),
      }),
    );
  });

  it('archives the prior crop asset after replacing it', async () => {
    const { service, assets } = serviceWith();
    const page = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();

    await service.replaceCanonicalRegion(
      { id: 'media-1', mediaKey: 'M0001', assetId: 'old-asset' },
      { id: 'batch-1', createdById: 'admin-1' },
      page,
      {
        type: 'DIAGRAM',
        bounds: { left: 100, top: 100, right: 500, bottom: 500 },
        confidence: 1,
        description: 'Replacement crop',
        warnings: [],
      },
      'admin-2',
    );

    expect(assets.archiveIfUnreferenced).toHaveBeenCalledWith(
      { id: 'admin-2' },
      'old-asset',
    );
  });

  it('records a failed crop without using a Prisma JSON equality filter', async () => {
    const { service, prisma, tx } = serviceWith();
    const checked = (service as any).validate(
      { left: 100, top: 100, right: 500, bottom: 500 },
      1000,
      1000,
      [],
    );

    await (service as any).recordFailedProposal(
      { id: 'batch-1' },
      1,
      1000,
      1000,
      {
        type: 'DIAGRAM',
        bounds: checked.bounds,
        confidence: 0.96,
        description: 'A diagram',
        warnings: [],
      },
      checked,
      { response: true },
      new Error('crop upload failed'),
    );

    expect(prisma.questionImportMedia.findMany).toHaveBeenCalledWith({
      where: {
        batchId: 'batch-1',
        pageNumber: 1,
        status: 'FAILED',
      },
    });
    expect(tx.questionImportMedia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaKey: expect.stringMatching(/^M-[0-9a-f-]{36}$/),
          status: 'FAILED',
          errorDetail: 'crop upload failed',
        }),
      }),
    );
  });

  it('allocates a unique media key without reading the current batch count', () => {
    const { service, prisma } = serviceWith();

    const keys = new Set(
      Array.from({ length: 100 }, () => (service as any).nextMediaKey()),
    );

    expect(keys.size).toBe(100);
    expect([...keys]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^M-[0-9a-f-]{36}$/)]),
    );
    expect((prisma.questionImportMedia as any).count).toBeUndefined();
  });

  it('retains the original crop error if failure persistence also fails', async () => {
    const { service, prisma } = serviceWith();
    prisma.questionImportMedia.findMany.mockRejectedValue(
      new Error('database unavailable'),
    );
    const checked = (service as any).validate(
      { left: 100, top: 100, right: 500, bottom: 500 },
      1000,
      1000,
      [],
    );

    await expect(
      (service as any).recordFailedProposal(
        { id: 'batch-1' },
        1,
        1000,
        1000,
        {
          type: 'DIAGRAM',
          bounds: checked.bounds,
          confidence: 0.96,
          description: 'A diagram',
          warnings: [],
        },
        checked,
        { response: true },
        new Error('crop upload failed'),
      ),
    ).rejects.toThrow(
      'Visual crop materialization failed: crop upload failed; failure persistence also failed: database unavailable',
    );
  });
});
