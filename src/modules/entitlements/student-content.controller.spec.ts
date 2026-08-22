import { StudentContentController } from './student-content.controller';

describe('StudentContentController video outline delivery', () => {
  const item = {
    id: 'video-1',
    type: 'VIDEO',
    placement: {},
    assetReferences: [],
  };

  function build() {
    const policy = {
      assertContentItemAccess: jest.fn().mockResolvedValue(item),
      toDeliveryDto: jest.fn().mockReturnValue({
        id: item.id,
        type: item.type,
        title: 'Video',
      }),
    };
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([null, null]),
      studentContentProgress: { findUnique: jest.fn() },
      studentContentStudyState: { findUnique: jest.fn() },
      videoOutlineTopic: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'topic-1',
            title: 'Forces',
            startSeconds: 10,
            endSeconds: 30,
            sortOrder: 1,
            concepts: [{ id: 'concept-1', title: 'Mass', sortOrder: 1 }],
          },
        ]),
      },
    };
    return {
      controller: new StudentContentController(
        policy as never,
        prisma as never,
      ),
      policy,
      prisma,
    };
  }

  it('preserves the delivery response unless the client opts in', async () => {
    const { controller, prisma } = build();

    await expect(
      controller.get({ id: 'student-1' } as never, item.id, {}),
    ).resolves.toMatchObject({ id: item.id, progress: { completed: false } });

    expect(prisma.videoOutlineTopic.findMany).not.toHaveBeenCalled();
  });

  it('returns the ordered outline only for an opted-in video request', async () => {
    const { controller, prisma } = build();

    await expect(
      controller.get({ id: 'student-1' } as never, item.id, {
        includeVideoOutline: 'true',
      }),
    ).resolves.toMatchObject({
      videoOutline: [
        {
          id: 'topic-1',
          title: 'Forces',
          concepts: [{ id: 'concept-1', title: 'Mass' }],
        },
      ],
    });

    expect(prisma.videoOutlineTopic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contentItemId: item.id } }),
    );
  });
});
