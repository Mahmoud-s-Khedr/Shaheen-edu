/* eslint-disable
  @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access
  -- Jest mocks model the Prisma delegates used by this service. */
import { BadRequestException } from '@nestjs/common';
import {
  AssetKind,
  AssetStatus,
  ContentStatus,
  Role,
} from '../../common/types/roles.enum';
import { TestimonialsService } from './testimonials.service';

const actor = { id: 'admin-1', role: Role.ADMIN, sessionId: 'session-1' };
const draft = {
  id: 'testimonial-1',
  reviewText: 'Clear explanations made a real difference.',
  reviewerName: 'A student',
  screenshotAltText: null,
  screenshotAssetId: null,
  status: ContentStatus.DRAFT,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: null,
  archivedAt: null,
  screenshotAsset: null,
};

function build() {
  const prisma: any = {
    testimonial: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const assets = {
    getReady: jest.fn(),
    protectedAccess: jest.fn(),
  };
  return {
    service: new TestimonialsService(prisma, audit as never, assets as never),
    prisma,
    audit,
    assets,
  };
}

describe('TestimonialsService', () => {
  it('creates text-only testimonials as drafts', async () => {
    const { service, prisma, audit } = build();
    prisma.testimonial.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
    prisma.testimonial.create.mockResolvedValue({ id: draft.id });
    prisma.testimonial.findUnique.mockResolvedValue({ ...draft, sortOrder: 4 });

    const result = await service.create(actor, {
      reviewText: draft.reviewText,
      reviewerName: draft.reviewerName,
    });

    expect(prisma.testimonial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewText: draft.reviewText,
        sortOrder: 4,
        status: ContentStatus.DRAFT,
      }),
    });
    expect(result.screenshotAssetId).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TESTIMONIAL_CREATED' }),
    );
  });

  it('requires accessible text for a screenshot testimonial', async () => {
    const { service } = build();
    await expect(
      service.create(actor, { screenshotAssetId: 'image-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only ready IMAGE assets as screenshots', async () => {
    const { service, prisma, assets } = build();
    assets.getReady.mockResolvedValue({ id: 'image-1', kind: AssetKind.PDF });
    prisma.testimonial.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });

    await expect(
      service.create(actor, {
        screenshotAssetId: 'image-1',
        screenshotAltText: 'A parent thanks the teacher for the lessons.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only returns a protected screenshot URL for a published testimonial', async () => {
    const { service, prisma, assets } = build();
    prisma.testimonial.findFirst.mockResolvedValue({
      ...draft,
      status: ContentStatus.PUBLISHED,
      screenshotAssetId: 'image-1',
      screenshotAsset: {
        id: 'image-1',
        kind: AssetKind.IMAGE,
        status: AssetStatus.READY,
        storageKey: 'assets/image/review.png',
      },
    });
    assets.protectedAccess.mockReturnValue({
      url: 'https://cdn.example.test/review.png',
      expiresAt: new Date(),
    });

    await expect(service.screenshotAccess(draft.id)).resolves.toEqual(
      expect.objectContaining({ url: expect.any(String) }),
    );
    expect(prisma.testimonial.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: draft.id, status: ContentStatus.PUBLISHED },
      }),
    );
  });
});
