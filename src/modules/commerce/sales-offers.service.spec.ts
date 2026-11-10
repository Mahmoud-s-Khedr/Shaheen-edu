import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AccessType,
  CommerceTargetType,
  Role,
} from '../../common/types/roles.enum';
import { SalesOffersService } from './sales-offers.service';
import type { SaveSalesOfferDto } from './dto/sales-offer.dto';

describe('SalesOffersService', () => {
  const actor = { id: 'admin', role: Role.SUPER_ADMIN } as any;
  const input = (): SaveSalesOfferDto => ({
    name: 'Offer',
    priceMinor: 500,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2027-01-01'),
    items: [{ targetType: CommerceTargetType.COURSE, targetId: 'course' }],
  });
  function setup() {
    const prisma: any = {
      course: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'course',
            accessType: AccessType.PAID,
            isPurchasable: true,
            priceMinor: 1000,
            currency: 'EGP',
          },
        ]),
      },
      chapter: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const tx: any = {
      salesOffer: {
        create: jest.fn(async ({ data }) => ({ id: 'offer', ...data })),
      },
    };
    prisma.$transaction = jest.fn((fn) => fn(tx));
    const audit: any = { recordWithClient: jest.fn() };
    return {
      service: new SalesOffersService(prisma, audit, {} as any),
      prisma,
      tx,
      audit,
    };
  }
  it('creates the offer and audits the content snapshot in one transaction', async () => {
    const { service, tx, audit } = setup();
    await service.save(actor, input());
    expect(tx.salesOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              {
                targetType: 'COURSE',
                targetId: 'course',
                courseId: 'course',
                chapterId: null,
              },
            ],
          },
        }),
      }),
    );
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'SALES_OFFER_CREATED' }),
    );
  });
  it('rejects duplicates and overlapping content', async () => {
    const { service, prisma } = setup();
    const duplicate = input();
    duplicate.items.push(duplicate.items[0]);
    await expect(service.save(actor, duplicate)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.chapter.findMany.mockResolvedValue([
      { id: 'chapter', courseId: 'course', priceMinor: 500, currency: 'EGP' },
    ]);
    const overlap = input();
    overlap.items.push({
      targetType: CommerceTargetType.CHAPTER,
      targetId: 'chapter',
    });
    await expect(service.save(actor, overlap)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('enforces standalone purchase rules and uses zero as the price of free courses', async () => {
    const { service, prisma } = setup();
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'course',
        accessType: 'PAID',
        isPurchasable: false,
        priceMinor: 1000,
        currency: 'EGP',
      },
    ]);
    await expect(service.save(actor, input())).rejects.toThrow(
      'Each offer item must be purchasable',
    );
    prisma.course.findMany.mockResolvedValue([
      {
        id: 'course',
        accessType: 'FREE',
        isPurchasable: false,
        priceMinor: 1000,
        currency: 'EGP',
      },
    ]);
    await expect(service.save(actor, input())).rejects.toThrow(
      'A paid offer must include an item with a positive price',
    );
    await expect(
      service.save(actor, { ...input(), priceMinor: 0 }),
    ).resolves.toBeDefined();
    prisma.course.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([
      {
        id: 'chapter',
        courseId: 'course',
        accessType: 'INHERIT',
        isPurchasable: true,
        priceMinor: 1000,
        currency: 'EGP',
      },
    ]);
    await expect(
      service.save(actor, {
        ...input(),
        items: [
          { targetType: CommerceTargetType.CHAPTER, targetId: 'chapter' },
        ],
      }),
    ).rejects.toThrow('Each offer item must be purchasable');
  });
  it('requires a super administrator', async () => {
    const { service } = setup();
    await expect(
      service.save({ id: 'student', role: Role.STUDENT } as any, input()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rechecks purchase eligibility when a student views an existing offer', async () => {
    const { service, prisma } = setup();
    prisma.salesOffer = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'offer',
        priceMinor: 500,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2100-01-01'),
        items: [{ targetType: 'COURSE', targetId: 'course' }],
      }),
    };
    prisma.studentProfile = {
      findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade' }),
    };
    prisma.course.findFirst = jest.fn().mockResolvedValue({
      id: 'course',
      accessType: 'PAID',
      isPurchasable: false,
      priceMinor: 1000,
      currency: 'EGP',
    });
    await expect(service.studentOffer('student', 'offer')).rejects.toThrow(
      'Offer content is unavailable',
    );
    prisma.course.findFirst.mockResolvedValue({
      id: 'course',
      title: 'Free',
      accessType: 'FREE',
      isPurchasable: false,
      priceMinor: 1000,
      currency: 'EGP',
    });
    prisma.studentEntitlement = {
      findFirst: jest.fn().mockResolvedValue(null),
    };
    await expect(service.studentOffer('student', 'offer')).rejects.toThrow(
      'Offer content is unavailable',
    );
    prisma.salesOffer.findUnique.mockResolvedValue({
      id: 'offer',
      priceMinor: 0,
      status: 'ACTIVE',
      purchaseLimit: null,
      startsAt: new Date('2020-01-01'),
      endsAt: new Date('2100-01-01'),
      items: [{ targetType: 'COURSE', targetId: 'course' }],
    });
    prisma.salesOfferPurchase = { count: jest.fn().mockResolvedValue(0) };
    await expect(
      service.studentOffer('student', 'offer'),
    ).resolves.toMatchObject({ items: [{ weightMinor: 0 }] });
  });
});
