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
  versionConflict,
} from '../../common/hierarchy/hierarchy.helper';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
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
import type { VersionOnlyDto } from '../../common/dto/version-only.dto';

type PlacementField = 'courseId' | 'chapterId' | 'lessonId' | 'sectionId';
type PlacementTarget = { field: PlacementField; id: string };

@Injectable()
export class ContentItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

  private async assertValidTarget(target: PlacementTarget): Promise<void> {
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
        accessLevel: dto.accessLevel,
        isPreview: dto.isPreview,
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
      accessLevel: query.accessLevel,
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
    const result = await this.prisma.contentItem.updateMany({
      where: { id, version: dto.version },
      data: {
        type,
        title: dto.title,
        description: dto.description,
        textBody,
        externalUrl,
        accessLevel: dto.accessLevel,
        isPreview: dto.isPreview,
        estimatedDuration: dto.estimatedDuration,
        updatedById: actor.id,
        version: { increment: 1 },
      },
    });
    if (!result.count) versionConflict();
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_UPDATED',
      targetType: 'ContentItem',
      targetId: id,
      metadata: { type },
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderContentItemDto): Promise<void> {
    this.assertActorRole(actor);
    const target = this.targetFromDto(dto.placement);
    await this.assertValidTarget(target);
    const siblings = await this.prisma.contentPlacement.findMany({
      where: this.scopeWhere(target),
      select: { id: true, contentItemId: true, sortOrder: true, version: true },
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
    const versions = new Map(
      dto.items.map((item) => [byContentId.get(item.id)!.id, item.version]),
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const step of plan.phase1) {
          const result = await tx.contentPlacement.updateMany({
            where: { id: step.id, version: versions.get(step.id) },
            data: { sortOrder: step.sortOrder, version: { increment: 1 } },
          });
          if (!result.count) versionConflict();
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
    const max = await this.prisma.contentPlacement.aggregate({
      where: this.scopeWhere(target),
      _max: { sortOrder: true },
    });
    const sameTarget =
      oldTarget.field === target.field && oldTarget.id === target.id;
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
        const preMove = await tx.contentPlacement.updateMany({
          where: { id: item.placement.id, version: dto.version },
          data: { sortOrder: 1_000_000_000, version: { increment: 1 } },
        });
        if (!preMove.count) versionConflict();
        await tx.contentPlacement.updateMany({
          where: {
            ...this.scopeWhere(oldTarget),
            sortOrder: { gt: item.placement.sortOrder },
          },
          data: { sortOrder: { decrement: 1 }, version: { increment: 1 } },
        });
        await tx.contentPlacement.updateMany({
          where: {
            ...this.scopeWhere(target),
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, version: { increment: 1 } },
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

  async archive(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);
    const result = await this.prisma.contentItem.updateMany({
      where: {
        id,
        version: dto.version,
        status: { not: ContentStatus.ARCHIVED },
      },
      data: {
        status: ContentStatus.ARCHIVED,
        archivedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (!result.count) {
      const current = await this.getOrThrow(id);
      if (current.version !== dto.version) versionConflict();
      throw new ConflictException('Content item is already archived');
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_ARCHIVED',
      targetType: 'ContentItem',
      targetId: id,
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);
    const result = await this.prisma.contentItem.updateMany({
      where: { id, version: dto.version, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        archivedAt: null,
        publishedAt: null,
        version: { increment: 1 },
      },
    });
    if (!result.count) {
      const current = await this.getOrThrow(id);
      if (current.version !== dto.version) versionConflict();
      throw new ConflictException(
        'Only an archived content item can be restored',
      );
    }
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
    id: string,
    dto: VersionOnlyDto,
  ): Promise<void> {
    this.assertActorRole(actor);
    const item = await this.getOrThrow(id);
    if (item.version !== dto.version) versionConflict();
    if (item.status !== ContentStatus.DRAFT)
      throw new ConflictException('Only a draft content item can be deleted');
    const result = await this.prisma.contentItem.deleteMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
    });
    if (!result.count) versionConflict();
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CONTENT_ITEM_DELETED',
      targetType: 'ContentItem',
      targetId: id,
    });
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
      accessLevel: item.accessLevel,
      isPreview: item.isPreview,
      estimatedDuration: item.estimatedDuration,
      status: item.status,
      placement: {
        id: placement.id,
        courseId: placement.courseId,
        chapterId: placement.chapterId,
        lessonId: placement.lessonId,
        sectionId: placement.sectionId,
        sortOrder: placement.sortOrder,
        version: placement.version,
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      publishedAt: item.publishedAt,
      archivedAt: item.archivedAt,
      version: item.version,
    };
  }
}
