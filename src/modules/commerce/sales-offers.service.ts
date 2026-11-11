import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssetsService } from '../assets/assets.service';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { assertSuperAdmin } from '../../common/authorization/admin-authorization';
import {
  AssetKind,
  CommerceTargetType,
  ContentStatus,
  EntitlementStatus,
} from '../../common/types/roles.enum';
import type { SaveSalesOfferDto } from './dto/sales-offer.dto';
import { purchasablePrice } from './purchasable-price';

@Injectable()
export class SalesOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetsService,
  ) {}

  async studentOffer(
    studentUserId: string,
    id: string,
    client: any = this.prisma,
    requireAvailable = true,
  ) {
    const now = new Date();
    const offer = await client.salesOffer.findUnique({
      where: { id },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    const profile = await client.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { academicGradeId: true },
    });
    if (!profile?.academicGradeId)
      throw new ConflictException('Student academic grade is required');
    const grade = {
      status: ContentStatus.PUBLISHED,
      subject: {
        status: ContentStatus.PUBLISHED,
        gradeAssignments: {
          some: {
            academicGradeId: profile.academicGradeId,
            academicGrade: { status: ContentStatus.PUBLISHED },
          },
        },
      },
    };
    const items = await Promise.all(
      offer.items.map(async (item: any) => {
        const courseItem = item.targetType === CommerceTargetType.COURSE;
        const content = courseItem
          ? await client.course.findFirst({
              where: { id: item.targetId, ...grade },
            })
          : await client.chapter.findFirst({
              where: {
                id: item.targetId,
                status: ContentStatus.PUBLISHED,
                course: grade,
              },
            });
        const weightMinor = content
          ? purchasablePrice(item.targetType, content)
          : null;
        if (!content || weightMinor === null)
          throw new NotFoundException('Offer content is unavailable');
        const courseId = courseItem ? content.id : content.courseId;
        const owned = await client.studentEntitlement.findFirst({
          where: {
            studentUserId,
            status: EntitlementStatus.ACTIVE,
            revokedAt: null,
            startsAt: { lte: now },
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              {
                OR: [
                  { courseId },
                  ...(!courseItem ? [{ chapterId: content.id }] : []),
                ],
              },
            ],
          },
          select: { id: true },
        });
        return {
          targetType: item.targetType,
          targetId: content.id,
          courseId,
          title: content.title,
          weightMinor,
          owned: Boolean(owned),
        };
      }),
    );
    if (
      offer.priceMinor > 0 &&
      items.every((item: any) => item.weightMinor === 0)
    )
      throw new NotFoundException('Offer content is unavailable');
    const where = {
      salesOfferId: id,
      allocatedAt: { not: null },
      releasedAt: null,
    };
    const [sold, purchased] = await Promise.all([
      client.salesOfferPurchase.count({ where }),
      client.salesOfferPurchase.count({ where: { ...where, studentUserId } }),
    ]);
    const remainingSpots =
      offer.purchaseLimit == null
        ? null
        : Math.max(0, offer.purchaseLimit - sold);
    const available =
      offer.status === 'ACTIVE' &&
      offer.startsAt <= now &&
      offer.endsAt > now &&
      (remainingSpots === null || remainingSpots > 0) &&
      !purchased;
    if (requireAvailable && !available)
      throw new ConflictException('Offer is not available for purchase');
    return {
      id: offer.id,
      name: offer.name,
      description: offer.description,
      marketingCopy: offer.marketingCopy,
      coverAssetId: offer.coverAssetId,
      priceMinor: offer.priceMinor,
      creditRewardMinor: offer.creditRewardMinor ?? 0,
      firstPurchaseEligible: offer.firstPurchaseEligible ?? false,
      currency: 'EGP',
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      status: offer.status,
      purchaseLimit: offer.purchaseLimit,
      remainingSpots,
      purchased: Boolean(purchased),
      available,
      items,
    };
  }

  async studentCatalog(studentUserId: string) {
    const offers = await this.prisma.salesOffer.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    const results = await Promise.all(
      offers.map(async (offer) => {
        try {
          return await this.studentOffer(
            studentUserId,
            offer.id,
            this.prisma,
            false,
          );
        } catch (error) {
          if (error instanceof NotFoundException) return null;
          throw error;
        }
      }),
    );
    return { data: results.filter(Boolean) };
  }

  async studentCover(studentUserId: string, id: string) {
    const offer = await this.studentOffer(
      studentUserId,
      id,
      this.prisma,
      false,
    );
    if (!offer.coverAssetId)
      throw new NotFoundException('Offer cover not found');
    const asset = await this.assets.getReady(offer.coverAssetId);
    return this.assets.protectedAccess(asset);
  }

  async save(actor: RequestUser, dto: SaveSalesOfferDto, id?: string) {
    assertSuperAdmin(actor);
    if (
      !dto.items?.length ||
      dto.items.some(
        (item) =>
          item.targetType !== CommerceTargetType.COURSE &&
          item.targetType !== CommerceTargetType.CHAPTER,
      )
    )
      throw new BadRequestException('Select at least one course or chapter');
    if (dto.endsAt <= dto.startsAt)
      throw new BadRequestException('Offer end must be after its start');
    const keys = new Set(
      dto.items.map((item) => `${item.targetType}:${item.targetId}`),
    );
    if (keys.size !== dto.items.length)
      throw new BadRequestException('Duplicate offer item');
    const courseIds = dto.items
      .filter((i) => i.targetType === CommerceTargetType.COURSE)
      .map((i) => i.targetId);
    const chapterIds = dto.items
      .filter((i) => i.targetType === CommerceTargetType.CHAPTER)
      .map((i) => i.targetId);
    const [courses, chapters] = await Promise.all([
      this.prisma.course.findMany({ where: { id: { in: courseIds } } }),
      this.prisma.chapter.findMany({ where: { id: { in: chapterIds } } }),
    ]);
    if (
      courses.length !== courseIds.length ||
      chapters.length !== chapterIds.length
    )
      throw new NotFoundException('Offer content not found');
    if (chapters.some((chapter) => courseIds.includes(chapter.courseId)))
      throw new BadRequestException(
        'An offer cannot contain a course and its chapter',
      );
    const weights = [
      ...courses.map((item) => purchasablePrice('COURSE', item)),
      ...chapters.map((item) => purchasablePrice('CHAPTER', item)),
    ];
    if (weights.some((weight) => weight === null))
      throw new BadRequestException('Each offer item must be purchasable');
    if (dto.priceMinor > 0 && weights.every((weight) => weight === 0))
      throw new BadRequestException(
        'A paid offer must include an item with a positive price',
      );
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      marketingCopy: dto.marketingCopy ?? null,
      coverAssetId: dto.coverAssetId ?? null,
      priceMinor: dto.priceMinor,
      creditRewardMinor: dto.creditRewardMinor ?? 0,
      firstPurchaseEligible: dto.firstPurchaseEligible ?? false,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      purchaseLimit: dto.purchaseLimit ?? null,
    };
    const items = dto.items.map((item) => ({
      ...item,
      courseId:
        item.targetType === CommerceTargetType.COURSE ? item.targetId : null,
      chapterId:
        item.targetType === CommerceTargetType.CHAPTER ? item.targetId : null,
    }));
    return this.prisma.$transaction(async (tx) => {
      if (dto.coverAssetId) {
        await this.assets.lockForReference(tx, dto.coverAssetId);
        const asset = await this.assets.getReady(dto.coverAssetId, tx);
        if (
          asset.kind !== AssetKind.COVER_IMAGE &&
          asset.kind !== AssetKind.IMAGE
        )
          throw new BadRequestException('Offer cover must be an image');
      }
      if (id) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-offer:${id}`}))`;
        const old = await tx.salesOffer.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Offer not found');
        if (old.status === 'ENDED')
          throw new ConflictException('Ended offers cannot be edited');
        const sold = await tx.salesOfferPurchase.count({
          where: {
            salesOfferId: id,
            allocatedAt: { not: null },
            releasedAt: null,
          },
        });
        if (dto.purchaseLimit != null && dto.purchaseLimit < sold)
          throw new ConflictException(
            'Purchase limit cannot be below allocated purchases',
          );
        await tx.salesOfferItem.deleteMany({ where: { offerId: id } });
      }
      const offer = id
        ? await tx.salesOffer.update({
            where: { id },
            data: { ...data, items: { create: items } },
            include: { items: true },
          })
        : await tx.salesOffer.create({
            data: { ...data, items: { create: items } },
            include: { items: true },
          });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: id ? 'SALES_OFFER_UPDATED' : 'SALES_OFFER_CREATED',
        targetType: 'SalesOffer',
        targetId: offer.id,
        metadata: {
          ...data,
          startsAt: data.startsAt.toISOString(),
          endsAt: data.endsAt.toISOString(),
          items: dto.items.map((item) => ({
            targetType: item.targetType,
            targetId: item.targetId,
          })),
        },
      });
      return offer;
    });
  }

  async list(actor: RequestUser) {
    assertSuperAdmin(actor);
    const offers = await this.prisma.salesOffer.findMany({
      include: {
        items: true,
        _count: {
          select: {
            purchases: {
              where: { allocatedAt: { not: null }, releasedAt: null },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return offers.map(({ _count, ...offer }) => ({
      ...offer,
      soldCount: _count.purchases,
      remainingSpots:
        offer.purchaseLimit == null
          ? null
          : Math.max(0, offer.purchaseLimit - _count.purchases),
    }));
  }

  async status(
    actor: RequestUser,
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'ENDED',
  ) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-offer:${id}`}))`;
      const current = await tx.salesOffer.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Offer not found');
      if (current.status === 'ENDED' && status !== 'ENDED')
        throw new ConflictException('Ended offers cannot be resumed');
      const offer = await tx.salesOffer.update({
        where: { id },
        data: { status },
        include: { items: true },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'SALES_OFFER_STATUS_CHANGED',
        targetType: 'SalesOffer',
        targetId: id,
        metadata: { previousStatus: current.status, status },
      });
      return offer;
    });
  }
}
