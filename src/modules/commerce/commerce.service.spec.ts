import { ConflictException } from '@nestjs/common';
import { AssetKind, AssetStatus, Role } from '../../common/types/roles.enum';
import { CommerceService } from './commerce.service';

describe('CommerceService payment proofs', () => {
  const studentUserId = 'student-1';
  const assetId = 'asset-1';

  function build() {
    const prisma: any = {
      manualPaymentSubmission: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const assets: any = {
      completeUpload: jest.fn().mockResolvedValue(undefined),
      getReady: jest.fn().mockResolvedValue({
        id: assetId,
        kind: AssetKind.PAYMENT_PROOF,
        status: AssetStatus.READY,
        uploadedById: studentUserId,
      }),
    };
    return { service: new CommerceService(prisma, assets, { record: jest.fn() } as any), assets };
  }

  it('verifies a direct-uploaded proof before accepting it for submission', async () => {
    const { service, assets } = build();

    await expect((service as any).paymentProof(studentUserId, assetId)).resolves.toMatchObject({ id: assetId });

    expect(assets.completeUpload).toHaveBeenCalledWith(
      { id: studentUserId, role: Role.STUDENT },
      assetId,
    );
    expect(assets.getReady).toHaveBeenCalledWith(assetId);
  });

  it('does not accept a proof when direct-upload verification fails', async () => {
    const { service, assets } = build();
    assets.completeUpload.mockRejectedValue(new ConflictException('Asset is not ready'));

    await expect((service as any).paymentProof(studentUserId, assetId)).rejects.toBeInstanceOf(ConflictException);

    expect(assets.getReady).not.toHaveBeenCalled();
  });
});
