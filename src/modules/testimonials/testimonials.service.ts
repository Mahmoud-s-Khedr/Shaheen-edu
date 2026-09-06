import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  assertCompleteSequentialReorder,
  computeTwoPhaseRenumber,
} from '../../common/hierarchy/hierarchy.helper';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  AssetKind,
  AssetStatus,
  ContentStatus,
  Role,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateTestimonialDto,
  QueryTestimonialDto,
  ReorderTestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';

type TestimonialRecord = {
  id: string;
  reviewText: string | null;
  reviewerName: string | null;
  screenshotAltText: string | null;
  screenshotAssetId: string | null;
  status: ContentStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
  screenshotAsset?: { filename: string } | null;
};

function updateTestimonialSortOrders(
  tx: Prisma.TransactionClient,
  items: Array<{ id: string; sortOrder: number }>,
  actorId?: string,
) {
  const rows = Prisma.join(
    items.map(
      ({ id, sortOrder }) => Prisma.sql`(${id}::text, ${sortOrder}::integer)`,
    ),
    ', ',
  );
  const auditFields = actorId
    ? Prisma.sql`, "updatedById" = ${actorId}, "updatedAt" = NOW()`
    : Prisma.empty;
  return tx.$executeRaw(Prisma.sql`
    UPDATE "Testimonial" AS testimonial
    SET "sortOrder" = reordered."sortOrder"${auditFields}
    FROM (VALUES ${rows}) AS reordered(id, "sortOrder")
    WHERE testimonial.id = reordered.id
  `);
}

@Injectable()
export class TestimonialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetsService,
  ) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private async getOrThrow(id: string): Promise<TestimonialRecord> {
    const testimonial = await this.prisma.testimonial.findUnique({
      where: { id },
      include: { screenshotAsset: { select: { filename: true } } },
    });
    if (!testimonial) throw new NotFoundException('Testimonial not found');
    return testimonial;
  }

  private async assertScreenshot(assetId: string | null) {
    if (!assetId) return;
    const asset = await this.assets.getReady(assetId);
    if (asset.kind !== AssetKind.IMAGE)
      throw new BadRequestException(
        'Testimonial screenshots must use an IMAGE asset',
      );
  }

  private assertContent(input: {
    reviewText: string | null;
    screenshotAssetId: string | null;
    screenshotAltText: string | null;
  }) {
    if (!input.reviewText && !input.screenshotAssetId)
      throw new BadRequestException(
        'A testimonial needs review text or a screenshot',
      );
    if (input.screenshotAssetId && !input.screenshotAltText)
      throw new BadRequestException(
        'Screenshot alt text is required with a review screenshot',
      );
    if (!input.screenshotAssetId && input.screenshotAltText)
      throw new BadRequestException(
        'Screenshot alt text requires a review screenshot',
      );
  }

  private fromCreate(dto: CreateTestimonialDto) {
    return {
      reviewText: dto.reviewText ?? null,
      reviewerName: dto.reviewerName ?? null,
      screenshotAssetId: dto.screenshotAssetId ?? null,
      screenshotAltText: dto.screenshotAltText ?? null,
    };
  }

  private fromUpdate(record: TestimonialRecord, dto: UpdateTestimonialDto) {
    return {
      reviewText:
        dto.reviewText === undefined ? record.reviewText : dto.reviewText,
      reviewerName:
        dto.reviewerName === undefined ? record.reviewerName : dto.reviewerName,
      screenshotAssetId:
        dto.screenshotAssetId === undefined
          ? record.screenshotAssetId
          : dto.screenshotAssetId,
      screenshotAltText:
        dto.screenshotAltText === undefined
          ? record.screenshotAltText
          : dto.screenshotAltText,
    };
  }

  async create(actor: RequestUser, dto: CreateTestimonialDto) {
    this.assertAdmin(actor);
    const content = this.fromCreate(dto);
    this.assertContent(content);
    await this.assertScreenshot(content.screenshotAssetId);

    const maxOrder = await this.prisma.testimonial.aggregate({
      where: { status: { not: ContentStatus.ARCHIVED } },
      _max: { sortOrder: true },
    });
    try {
      const testimonial = await this.prisma.testimonial.create({
        data: {
          ...content,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
          status: ContentStatus.DRAFT,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'TESTIMONIAL_CREATED',
        targetType: 'Testimonial',
        targetId: testimonial.id,
      });
      return this.toSummary(await this.getOrThrow(testimonial.id));
    } catch (error) {
      this.throwConflict(
        error,
        'Screenshot is already attached to a testimonial',
      );
    }
  }

  async get(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryTestimonialDto) {
    this.assertAdmin(actor);
    const where = {
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({
        where,
        include: { screenshotAsset: { select: { filename: true } } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.testimonial.count({ where }),
    ]);
    return {
      data: data.map((testimonial) => this.toSummary(testimonial)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateTestimonialDto) {
    this.assertAdmin(actor);
    const existing = await this.getOrThrow(id);
    const content = this.fromUpdate(existing, dto);
    this.assertContent(content);
    await this.assertScreenshot(content.screenshotAssetId);
    try {
      await this.prisma.testimonial.update({
        where: { id },
        data: { ...content, updatedById: actor.id },
      });
    } catch (error) {
      this.throwConflict(
        error,
        'Screenshot is already attached to a testimonial',
      );
    }
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_UPDATED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderTestimonialDto) {
    this.assertAdmin(actor);
    const existing = await this.prisma.testimonial.findMany({
      where: { status: { not: ContentStatus.ARCHIVED } },
      select: { id: true, sortOrder: true },
    });
    assertCompleteSequentialReorder(dto.items, existing);
    const plan = computeTwoPhaseRenumber(dto.items);
    try {
      await this.prisma.$transaction(async (tx) => {
        await updateTestimonialSortOrders(tx, plan.phase1);
        await updateTestimonialSortOrders(tx, plan.phase2, actor.id);
      });
    } catch (error) {
      this.throwConflict(error, 'Reorder produced a duplicate sort order');
    }
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_REORDERED',
      targetType: 'Testimonial',
      targetId: 'batch',
      metadata: { itemIds: dto.items.map((item) => item.id) },
    });
  }

  async publish(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const existing = await this.getOrThrow(id);
    if (existing.status === ContentStatus.ARCHIVED)
      throw new ConflictException(
        'Archived testimonials must be restored first',
      );
    this.assertContent(existing);
    await this.assertScreenshot(existing.screenshotAssetId);
    await this.prisma.testimonial.update({
      where: { id },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: existing.publishedAt ?? new Date(),
        updatedById: actor.id,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_PUBLISHED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async unpublish(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const existing = await this.getOrThrow(id);
    if (existing.status === ContentStatus.ARCHIVED)
      throw new ConflictException(
        'Archived testimonials must be restored first',
      );
    await this.prisma.testimonial.update({
      where: { id },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        updatedById: actor.id,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_UNPUBLISHED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    await this.getOrThrow(id);
    await this.prisma.testimonial.update({
      where: { id },
      data: {
        status: ContentStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: actor.id,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_ARCHIVED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const existing = await this.getOrThrow(id);
    if (existing.status !== ContentStatus.ARCHIVED)
      throw new ConflictException('Only archived testimonials can be restored');
    const maxOrder = await this.prisma.testimonial.aggregate({
      where: { status: { not: ContentStatus.ARCHIVED } },
      _max: { sortOrder: true },
    });
    await this.prisma.testimonial.update({
      where: { id },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        updatedById: actor.id,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_RESTORED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const existing = await this.getOrThrow(id);
    if (existing.status !== ContentStatus.DRAFT)
      throw new ConflictException('Only a draft testimonial can be deleted');
    await this.prisma.testimonial.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'TESTIMONIAL_DELETED',
      targetType: 'Testimonial',
      targetId: id,
    });
    return { id, deleted: true };
  }

  async listPublished(query: { page: number; limit: number }) {
    const where = { status: ContentStatus.PUBLISHED };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.testimonial.findMany({
        where,
        include: { screenshotAsset: { select: { filename: true } } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.testimonial.count({ where }),
    ]);
    return {
      data: data.map((testimonial) => this.toPublicSummary(testimonial)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async screenshotAccess(id: string) {
    const testimonial = await this.prisma.testimonial.findFirst({
      where: { id, status: ContentStatus.PUBLISHED },
      include: { screenshotAsset: true },
    });
    if (!testimonial?.screenshotAssetId || !testimonial.screenshotAsset)
      throw new NotFoundException('Testimonial screenshot not found');
    if (
      testimonial.screenshotAsset.kind !== AssetKind.IMAGE ||
      testimonial.screenshotAsset.status !== AssetStatus.READY
    )
      throw new NotFoundException('Testimonial screenshot not found');
    return this.assets.protectedAccess(testimonial.screenshotAsset);
  }

  private throwConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }

  private toSummary(record: TestimonialRecord) {
    return {
      id: record.id,
      reviewText: record.reviewText,
      reviewerName: record.reviewerName,
      screenshotAssetId: record.screenshotAssetId,
      screenshotAssetName: record.screenshotAsset?.filename ?? null,
      screenshotAltText: record.screenshotAltText,
      status: record.status,
      sortOrder: record.sortOrder,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
    };
  }

  private toPublicSummary(record: TestimonialRecord) {
    return {
      id: record.id,
      reviewText: record.reviewText,
      reviewerName: record.reviewerName,
      screenshotAltText: record.screenshotAltText,
      screenshotAccessPath: record.screenshotAssetId
        ? `/api/v1/testimonials/${record.id}/screenshot/access`
        : null,
      sortOrder: record.sortOrder,
    };
  }
}
