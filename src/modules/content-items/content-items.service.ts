import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import {
  assertCompleteSequentialReorder,
  computeTwoPhaseRenumber,
} from '../../common/hierarchy/hierarchy.helper';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  AccessType,
  ContentItemType,
  ContentStatus,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { CreateContentItemDto } from './dto/create-content-item.dto';
import type { UpdateContentItemDto } from './dto/update-content-item.dto';
import type { QueryContentItemDto } from './dto/query-content-item.dto';
import type { MoveContentItemDto } from './dto/move-content-item.dto';
import type { ReorderContentItemDto } from './dto/reorder-content-item.dto';
import type { ContentPlacementTargetDto } from './dto/content-placement-target.dto';
import { AssetsService } from '../assets/assets.service';
import { PublicationService } from '../publication/publication.service';

type PlacementField = 'courseId' | 'chapterId' | 'lessonId' | 'sectionId';
type PlacementTarget = { field: PlacementField; id: string };

@Injectable()
export class ContentItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly assets: AssetsService,
    private readonly publicationService: PublicationService,
  ) {}

  private assertActorRole(actor: RequestUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private targetFromDto(target: ContentPlacementTargetDto): PlacementTarget {
    const entries = (
      ['courseId', 'chapterId', 'lessonId', 'sectionId'] as const
    )
      .filter((field) => target[field]?.trim())
      .map((field) => ({ field, id: target[field]!.trim() }));
    if (entries.length !== 1)
      throw new BadRequestException(
        'placement must include exactly one hierarchy target',
      );
    return entries[0];
  }

  private targetFromPlacement(placement: {
    courseId: string | null;
    chapterId: string | null;
    lessonId: string | null;
    sectionId: string | null;
  }): PlacementTarget {
    return this.targetFromDto({
      courseId: placement.courseId ?? undefined,
      chapterId: placement.chapterId ?? undefined,
      lessonId: placement.lessonId ?? undefined,
      sectionId: placement.sectionId ?? undefined,
    });
  }

  private scopeWhere(
    target: PlacementTarget,
  ): Prisma.ContentPlacementWhereInput {
    return { [target.field]: target.id };
  }

  private async assertValidTarget(target: PlacementTarget) {
    const record =
      target.field === 'courseId'
        ? await this.prisma.course.findUnique({ where: { id: target.id } })
        : target.field === 'chapterId'
          ? await this.prisma.chapter.findUnique({ where: { id: target.id } })
          : target.field === 'lessonId'
            ? await this.prisma.lesson.findUnique({ where: { id: target.id } })
            : await this.prisma.section.findUnique({
                where: { id: target.id },
              });
    if (!record)
      throw new NotFoundException('Content placement target not found');
    if (record.status === ContentStatus.ARCHIVED)
      throw new ConflictException('Cannot place content in an archived target');
    return record;
  }

  private async getOrThrow(id: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: { placement: true },
    });
    if (!item || !item.placement)
      throw new NotFoundException('Content item not found');
    return item as typeof item & {
      placement: NonNullable<typeof item.placement>;
    };
  }

  private assertTypeFields(
    type: ContentItemType,
    textBody: string | null,
    externalUrl: string | null,
  ): void {
    if (type === ContentItemType.TEXT && !textBody?.trim())
      throw new BadRequestException(
        'TEXT content requires a non-empty textBody',
      );
    if (type === ContentItemType.EXTERNAL_LINK) {
      try {
        if (!externalUrl || new URL(externalUrl).protocol !== 'https:')
          throw new Error();
      } catch {
        throw new BadRequestException(
          'EXTERNAL_LINK content requires a valid HTTPS externalUrl',
        );
      }
    }
  }

  private mapUniqueError(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }

  async create(actor: RequestUser, dto: CreateContentItemDto) {
    this.assertActorRole(actor);
    const target = this.targetFromDto(dto.placement);
    await this.assertValidTarget(target);
    this.assertTypeFields(
      dto.type,
      dto.textBody ?? null,
      dto.externalUrl ?? null,
    );
    const max = await this.prisma.contentPlacement.aggregate({
      where: this.scopeWhere(target),
      _max: { sortOrder: true },
    });
    const created = await this.prisma.contentItem.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        textBody: dto.textBody,
        externalUrl: dto.externalUrl,
        accessType: dto.accessType,
        estimatedDuration: dto.estimatedDuration,
        createdById: actor.id,
        updatedById: actor.id,
        placement: {
          create: {
            courseId: target.field === 'courseId' ? target.id : null,
            chapterId: target.field === 'chapterId' ? target.id : null,
            lessonId: target.field === 'lessonId' ? target.id : null,
            sectionId: target.field === 'sectionId' ? target.id : null,
            sortOrder: (max._max.sortOrder ?? 0) + 1,
          },
        },
      },
      include: { placement: true },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_CREATED',
      targetType: 'ContentItem',
      targetId: created.id,
      metadata: {
        type: created.type,
        target: target.field,
        targetId: target.id,
      },
    });
    return this.toSummary(
      created as typeof created & {
        placement: NonNullable<typeof created.placement>;
      },
    );
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryContentItemDto) {
    this.assertActorRole(actor);
    const targetFields = [
      query.courseId,
      query.chapterId,
      query.lessonId,
      query.sectionId,
    ].filter(Boolean);
    if (targetFields.length > 1)
      throw new BadRequestException('Use at most one placement target filter');
    const placementWhere: Prisma.ContentPlacementWhereInput = query.courseId
      ? { courseId: query.courseId }
      : query.chapterId
        ? { chapterId: query.chapterId }
        : query.lessonId
          ? { lessonId: query.lessonId }
          : query.sectionId
            ? { sectionId: query.sectionId }
            : {};
    const where: Prisma.ContentItemWhereInput = {
      status: query.status ?? { not: ContentStatus.ARCHIVED },
      type: query.type,
      accessType: query.accessType,
      placement: { is: placementWhere },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentItem.findMany({
        where,
        include: { placement: true },
        orderBy: [{ placement: { sortOrder: 'asc' } }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.contentItem.count({ where }),
    ]);
    return {
      data: items.map((item) =>
        this.toSummary(
          item as typeof item & {
            placement: NonNullable<typeof item.placement>;
          },
        ),
      ),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateContentItemDto) {
    this.assertActorRole(actor);
    const item = await this.getOrThrow(id);
    const type = dto.type ?? item.type;
    const textBody = dto.textBody === undefined ? item.textBody : dto.textBody;
    const externalUrl =
      dto.externalUrl === undefined ? item.externalUrl : dto.externalUrl;
    this.assertTypeFields(type, textBody, externalUrl);
    await this.prisma.contentItem.updateMany({
      where: { id },
      data: {
        type,
        title: dto.title,
        description: dto.description,
        textBody,
        externalUrl,
        accessType: dto.accessType,
        estimatedDuration: dto.estimatedDuration,
        updatedById: actor.id,
        },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_UPDATED',
      targetType: 'ContentItem',
      targetId: id,
      metadata: { type },
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async updateAccess(actor: RequestUser, id: string, accessType: AccessType) {
    this.assertActorRole(actor);
    await this.getOrThrow(id);
    await this.prisma.contentItem.update({ where: { id }, data: { accessType, updatedById: actor.id } });
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_ITEM_ACCESS_UPDATED', targetType: 'ContentItem', targetId: id, metadata: { accessType } });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderContentItemDto): Promise<void> {
    this.assertActorRole(actor);
    const target = this.targetFromDto(dto.placement);
    await this.assertValidTarget(target);
    const siblings = await this.prisma.contentPlacement.findMany({
      where: this.scopeWhere(target),
      select: { id: true, contentItemId: true, sortOrder: true },
    });
    assertCompleteSequentialReorder(
      dto.items,
      siblings.map((s) => ({ id: s.contentItemId, sortOrder: s.sortOrder })),
    );
    const byContentId = new Map(siblings.map((s) => [s.contentItemId, s]));
    const plan = computeTwoPhaseRenumber(
      dto.items.map((item) => ({
        id: byContentId.get(item.id)!.id,
        sortOrder: item.sortOrder,
      })),
    );
        try {
      await this.prisma.$transaction(async (tx) => {
        for (const step of plan.phase1) {
    await tx.contentPlacement.updateMany({
            where: { id: step.id },
            data: { sortOrder: step.sortOrder, },
          });
        }
        for (const step of plan.phase2)
          await tx.contentPlacement.updateMany({
            where: { id: step.id },
            data: { sortOrder: step.sortOrder },
          });
      });
    } catch (error) {
      this.mapUniqueError(
        error,
        'Reorder produced a duplicate sortOrder within this target',
      );
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_REORDERED',
      targetType: 'ContentPlacement',
      targetId: target.id,
      metadata: {
        target: target.field,
        itemIds: dto.items.map((item) => item.id),
      },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveContentItemDto) {
    this.assertActorRole(actor);
    const item = await this.getOrThrow(id);
    if (item.status === ContentStatus.ARCHIVED)
      throw new ConflictException('Archived content cannot be moved');
    const target = this.targetFromDto(dto.placement);
    await this.assertValidTarget(target);
    const oldTarget = this.targetFromPlacement(item.placement);
    if (oldTarget.field === target.field && oldTarget.id === target.id) {
      throw new ConflictException('Use reorder to change position within the same parent');
    }
    const max = await this.prisma.contentPlacement.aggregate({
      where: this.scopeWhere(target),
      _max: { sortOrder: true },
    });
    const sameTarget = false;
    const targetSortOrder =
      dto.sortOrder ??
      (sameTarget ? (max._max.sortOrder ?? 1) : (max._max.sortOrder ?? 0) + 1);
    const maxAllowed = (max._max.sortOrder ?? 0) + (sameTarget ? 0 : 1);
    if (targetSortOrder < 1 || targetSortOrder > maxAllowed)
      throw new ConflictException(
        'Target sortOrder is outside the sibling scope',
      );
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.contentPlacement.updateMany({
          where: { id: item.placement.id },
          data: { sortOrder: 1_000_000_000, },
        });

        await tx.contentPlacement.updateMany({
          where: {
            ...this.scopeWhere(oldTarget),
            sortOrder: { gt: item.placement.sortOrder },
          },
          data: { sortOrder: { decrement: 1 }, },
        });
        await tx.contentPlacement.updateMany({
          where: {
            ...this.scopeWhere(target),
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, },
        });
        await tx.contentPlacement.update({
          where: { id: item.placement.id },
          data: {
            courseId: target.field === 'courseId' ? target.id : null,
            chapterId: target.field === 'chapterId' ? target.id : null,
            lessonId: target.field === 'lessonId' ? target.id : null,
            sectionId: target.field === 'sectionId' ? target.id : null,
            sortOrder: targetSortOrder,
          },
        });
      });
    } catch (error) {
      this.mapUniqueError(
        error,
        'Move produced a duplicate sortOrder within a target',
      );
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_MOVED',
      targetType: 'ContentItem',
      targetId: id,
      metadata: { from: oldTarget, to: target },
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.contentItem.updateMany({
      where: {
        id,
        status: { not: ContentStatus.ARCHIVED },
      },
      data: {
        status: ContentStatus.ARCHIVED,
        archivedAt: new Date(),
        },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_ARCHIVED',
      targetType: 'ContentItem',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('contentItem', id, actor.id);
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_ITEM_PUBLISHED', targetType: 'ContentItem', targetId: id });
    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.contentItem.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        archivedAt: null,
        publishedAt: null,
        },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_RESTORED',
      targetType: 'ContentItem',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(
    actor: RequestUser,
    id: string
  ): Promise<void> {
    this.assertActorRole(actor);
    const item = await this.getOrThrow(id);
    if (item.status !== ContentStatus.DRAFT)
      throw new ConflictException('Only a draft content item can be deleted');
    await this.prisma.contentItem.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_DELETED',
      targetType: 'ContentItem',
      targetId: id,
    });
  }

  async setPrimaryAsset(actor: RequestUser, id: string, assetId: string) {
    this.assertActorRole(actor);
    const item = await this.getOrThrow(id);
    const asset = await this.assets.getReady(assetId);
    this.assets.assertCompatible(asset, item.type);
    const previousAssetId = item.primaryAssetId;
    await this.prisma.contentItem.update({ where: { id }, data: { primaryAssetId: assetId, updatedById: actor.id } });
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_PRIMARY_ASSET_SET', targetType: 'ContentItem', targetId: id, metadata: { assetId } });
    if (previousAssetId && previousAssetId !== assetId) await this.assets.archiveIfUnreferenced(actor, previousAssetId);
    return this.toSummary(await this.getOrThrow(id));
  }

  async addAttachment(actor: RequestUser, id: string, assetId: string) {
    this.assertActorRole(actor); await this.getOrThrow(id); const asset = await this.assets.getReady(assetId); if (asset.kind === 'PAYMENT_PROOF') throw new BadRequestException('Payment proofs cannot be content attachments');
    const max = await this.prisma.assetReference.aggregate({ where: { contentItemId: id }, _max: { sortOrder: true } });
    await this.prisma.assetReference.create({ data: { contentItemId: id, assetId, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_ATTACHMENT_ADDED', targetType: 'ContentItem', targetId: id, metadata: { assetId } });
    return this.toSummary(await this.getOrThrow(id));
  }

  async removeAttachment(actor: RequestUser, id: string, assetId: string) {
    this.assertActorRole(actor); const ref = await this.prisma.assetReference.findUnique({ where: { contentItemId_assetId: { contentItemId: id, assetId } } }); if (!ref) throw new NotFoundException('Attachment not found');
    await this.prisma.$transaction([this.prisma.assetReference.delete({ where: { id: ref.id } }), this.prisma.assetReference.updateMany({ where: { contentItemId: id, sortOrder: { gt: ref.sortOrder } }, data: { sortOrder: { decrement: 1 } } })]);
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_ATTACHMENT_REMOVED', targetType: 'ContentItem', targetId: id, metadata: { assetId } });
  }

  async reorderAttachments(actor: RequestUser, id: string, assetIds: string[]) {
    this.assertActorRole(actor);
    const references = await this.prisma.assetReference.findMany({ where: { contentItemId: id }, select: { id: true, assetId: true } });
    if (assetIds.length !== references.length || new Set(assetIds).size !== assetIds.length || references.some((reference) => !assetIds.includes(reference.assetId))) throw new BadRequestException('assetIds must contain every attachment exactly once');
    await this.prisma.$transaction(async (tx) => { for (let index = 0; index < references.length; index++) await tx.assetReference.update({ where: { id: references[index].id }, data: { sortOrder: 1_000_000 + index } }); for (let index = 0; index < assetIds.length; index++) await tx.assetReference.update({ where: { contentItemId_assetId: { contentItemId: id, assetId: assetIds[index] } }, data: { sortOrder: index + 1 } }); });
    await this.auditService.record({ actorUserId: actor.id, action: 'CONTENT_ATTACHMENTS_REORDERED', targetType: 'ContentItem', targetId: id, metadata: { assetIds } });
  }

  private toSummary(
    item: Awaited<ReturnType<ContentItemsService['getOrThrow']>>,
  ) {
    const { placement } = item;
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      textBody: item.textBody,
      externalUrl: item.externalUrl,
      accessType: item.accessType,
      estimatedDuration: item.estimatedDuration,
      status: item.status,
      placement: {
        id: placement.id,
        courseId: placement.courseId,
        chapterId: placement.chapterId,
        lessonId: placement.lessonId,
        sectionId: placement.sectionId,
        sortOrder: placement.sortOrder,
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      publishedAt: item.publishedAt,
      archivedAt: item.archivedAt,
      primaryAssetId: item.primaryAssetId,
    };
  }
}
