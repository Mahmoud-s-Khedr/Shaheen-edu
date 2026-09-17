import { Role } from '../../common/types/roles.enum';
import { ContentItemsService } from './content-items.service';

describe('ContentItemsService primary video ownership', () => {
  it('returns the stable conflict before assigning an already-owned video', async () => {
    const prisma: any = {
      contentItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other-content' }),
        update: jest.fn(),
      },
    };
    const service = new ContentItemsService(
      prisma,
      {} as any,
      {
        getReadyOrAny: jest
          .fn()
          .mockResolvedValue({ id: 'video-1', kind: 'VIDEO', status: 'READY' }),
        assertCompatible: jest.fn(),
      } as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'getOrThrow')
      .mockResolvedValue({
        id: 'content-1',
        type: 'VIDEO',
        primaryAssetId: null,
      });
    await expect(
      service.setPrimaryAsset(
        { id: 'admin-1', role: Role.ADMIN, sessionId: 's' },
        'content-1',
        'video-1',
      ),
    ).rejects.toMatchObject({ code: 'VIDEO_ALREADY_ASSIGNED_TO_CONTENT_ITEM' });
    expect(prisma.contentItem.update).not.toHaveBeenCalled();
  });
});
