import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccessType, ContentStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  computeTwoPhaseRenumber,
  slugifyOrThrow,
  assertCompleteSequentialReorder,
} from '../../common/hierarchy/hierarchy.helper';
import type { CreateSectionDto } from './dto/create-section.dto';
import type { UpdateSectionDto } from './dto/update-section.dto';
import type { QuerySectionDto } from './dto/query-section.dto';
import {
  paginateArabicSearch,
  sqlAnd,
} from '../../common/search/arabic-search';
import { contentStatusScope } from '../../common/search/content-scope';
import type { ReorderSectionDto } from './dto/reorder-section.dto';
import type { MoveSectionDto } from './dto/move-section.dto';
import { PublicationService } from '../publication/publication.service';
import { contentPlacementAncestry } from '../../common/hierarchy/content-placement-ancestry.helper';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 *
 * Sections have no children in Phase 1 (ContentItem attaches to sections in
 * a later phase), so eligible-draft-delete skips the child-count check.
 */
@Injectable()
export class SectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly publicationService: PublicationService,
  ) {}

  private assertActorRole(actor: RequestUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getOrThrow(id: string) {
    const record = await this.prisma.section.findUnique({
      where: { id },
      include: {
        lesson: { select: { title: true } },
        coverAsset: { select: { filename: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('Section not found');
    }
    return record;
  }

  private mapUniqueConstraintError(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }

  async create(actor: RequestUser, dto: CreateSectionDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });
    if (!parent) {
      throw new NotFoundException('Lesson not found');
    }
    if (parent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot add sections to an archived lesson');
    }

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.section.findUnique({
      where: { lessonId_slug: { lessonId: dto.lessonId, slug } },
    });
    if (existing) {
      throw new ConflictException('Slug already in use within this lesson');
    }

    const maxOrder = await this.prisma.section.aggregate({
      where: { lessonId: dto.lessonId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.section.create({
      data: {
        lessonId: dto.lessonId,
        title: dto.title,
        slug,
        description: dto.description,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        status: ContentStatus.DRAFT,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_CREATED',
      targetType: 'Section',
      targetId: created.id,
      metadata: { lessonId: dto.lessonId, slug },
    });

    return this.toSummary(await this.getOrThrow(created.id));
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QuerySectionDto) {
    this.assertActorRole(actor);
    const where = {
      lessonId: query.lessonId,
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const { data: items, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.section,
      target: 'section',
      q: query.q,
      scope: {
        where: sqlAnd(
          contentStatusScope(query.status),
          query.lessonId
            ? Prisma.sql`t."lessonId" = ${query.lessonId}`
            : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where,
      args: {
        include: {
          lesson: { select: { title: true } },
          coverAsset: { select: { filename: true } },
        },
      },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: items.map((item) => this.toSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateSectionDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.section.findUnique({
          where: {
            lessonId_slug: { lessonId: record.lessonId, slug: candidate },
          },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException('Slug already in use within this lesson');
        }
        slug = candidate;
      }
    }
    await this.prisma.section.updateMany({
      where: { id },
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        updatedById: actor.id,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_UPDATED',
      targetType: 'Section',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async updateAccess(actor: RequestUser, id: string, accessType: AccessType) {
    this.assertActorRole(actor);
    await this.getOrThrow(id);
    await this.prisma.section.update({
      where: { id },
      data: { accessType, updatedById: actor.id },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_ACCESS_UPDATED',
      targetType: 'Section',
      targetId: id,
      metadata: { accessType },
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderSectionDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
    });
    if (!parent) {
      throw new NotFoundException('Lesson not found');
    }

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.section.findMany({
      where: { lessonId: dto.lessonId },
    });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
          await tx.section.updateMany({
            where: { id: phase1.id },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id },
          });
        }
        for (const phase2 of plan.phase2) {
          await tx.section.updateMany({
            where: { id: phase2.id },
            data: { sortOrder: phase2.sortOrder },
          });
        }
      });
    } catch (error) {
      this.mapUniqueConstraintError(
        error,
        'Reorder produced a duplicate sortOrder within this scope',
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_REORDERED',
      targetType: 'Section',
      targetId: dto.lessonId,
      metadata: { itemIds: ids },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveSectionDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.lessonId === dto.newLessonId)
      throw new ConflictException(
        'Use reorder to change position within the same parent',
      );

    const newParent = await this.prisma.lesson.findUnique({
      where: { id: dto.newLessonId },
      include: {
        chapter: { include: { course: { include: { subject: true } } } },
      },
    });
    if (!newParent) {
      throw new NotFoundException('Lesson not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot move into an archived lesson');
    }
    if (
      record.status === ContentStatus.PUBLISHED &&
      newParent.status !== ContentStatus.PUBLISHED
    ) {
      throw new ConflictException(
        'A published section must remain under a published lesson',
      );
    }

    const slugCollision = await this.prisma.section.findUnique({
      where: {
        lessonId_slug: { lessonId: dto.newLessonId, slug: record.slug },
      },
    });
    if (slugCollision && slugCollision.id !== id) {
      throw new ConflictException(
        'Slug already in use in the target lesson; rename before moving',
      );
    }

    const targetMax = await this.prisma.section.aggregate({
      where: { lessonId: dto.newLessonId },
      _max: { sortOrder: true },
    });
    const targetSortOrder =
      dto.sortOrder ??
      (dto.newLessonId === record.lessonId
        ? (targetMax._max.sortOrder ?? 1)
        : (targetMax._max.sortOrder ?? 0) + 1);
    if (
      targetSortOrder < 1 ||
      targetSortOrder >
        (targetMax._max.sortOrder ?? 0) +
          (dto.newLessonId === record.lessonId ? 0 : 1)
    ) {
      throw new ConflictException(
        'Target sortOrder is outside the sibling scope',
      );
    }
    const oldLessonId = record.lessonId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.section.updateMany({
          where: { id },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id },
        });

        await tx.section.updateMany({
          where: { lessonId: oldLessonId, sortOrder: { gt: oldSortOrder } },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id },
        });

        await tx.section.updateMany({
          where: {
            lessonId: dto.newLessonId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id },
        });

        await tx.section.updateMany({
          where: { id },
          data: {
            lessonId: dto.newLessonId,
            sortOrder: targetSortOrder,
            updatedById: actor.id,
          },
        });

        await contentPlacementAncestry.sectionMoved(tx, id, {
          academicGradeId: newParent.chapter.course.subject.academicGradeId,
          subjectId: newParent.chapter.course.subjectId,
          courseId: newParent.chapter.courseId,
          chapterId: newParent.chapterId,
          lessonId: newParent.id,
        });
      });
    } catch (error) {
      this.mapUniqueConstraintError(
        error,
        'Move produced a duplicate sortOrder within a scope',
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_MOVED',
      targetType: 'Section',
      targetId: id,
      metadata: { fromLessonId: oldLessonId, toLessonId: dto.newLessonId },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('section', id, actor.id);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_PUBLISHED',
      targetType: 'Section',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);

    await this.publicationService.assertCanArchive('section', id);
    await this.prisma.section.updateMany({
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
      action: 'SECTION_ARCHIVED',
      targetType: 'Section',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.section.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_RESTORED',
      targetType: 'Section',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(actor: RequestUser, id: string): Promise<void> {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.status !== ContentStatus.DRAFT) {
      throw new ConflictException('Only a draft section can be deleted');
    }
    await this.prisma.section.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_DELETED',
      targetType: 'Section',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    lessonId: string;
    title: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    status: ContentStatus;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    archivedAt: Date | null;
    accessType: AccessType;
    coverAssetId: string | null;
    coverAsset?: { filename: string } | null;
    lesson?: { title: string };
  }) {
    return {
      id: record.id,
      lessonId: record.lessonId,
      lessonName: record.lesson?.title ?? null,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      status: record.status,
      accessType: record.accessType,
      coverAssetId: record.coverAssetId,
      coverAssetName: record.coverAsset?.filename ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
    };
  }
}
