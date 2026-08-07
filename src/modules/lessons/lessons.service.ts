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
import type { CreateLessonDto } from './dto/create-lesson.dto';
import type { UpdateLessonDto } from './dto/update-lesson.dto';
import type { QueryLessonDto } from './dto/query-lesson.dto';
import type { ReorderLessonDto } from './dto/reorder-lesson.dto';
import type { MoveLessonDto } from './dto/move-lesson.dto';
import { PublicationService } from '../publication/publication.service';
import { contentPlacementAncestry } from '../../common/hierarchy/content-placement-ancestry.helper';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 */
@Injectable()
export class LessonsService {
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
    const record = await this.prisma.lesson.findUnique({
      where: { id },
      include: { _count: { select: { sections: { where: { status: { not: ContentStatus.ARCHIVED } } } } } },
    });
    if (!record) {
      throw new NotFoundException('Lesson not found');
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

  async create(actor: RequestUser, dto: CreateLessonDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.chapter.findUnique({
      where: { id: dto.chapterId },
    });
    if (!parent) {
      throw new NotFoundException('Chapter not found');
    }
    if (parent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot add lessons to an archived chapter');
    }

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.lesson.findUnique({
      where: { chapterId_slug: { chapterId: dto.chapterId, slug } },
    });
    if (existing) {
      throw new ConflictException('Slug already in use within this chapter');
    }

    const maxOrder = await this.prisma.lesson.aggregate({
      where: { chapterId: dto.chapterId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.lesson.create({
      data: {
        chapterId: dto.chapterId,
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
      action: 'LESSON_CREATED',
      targetType: 'Lesson',
      targetId: created.id,
      metadata: { chapterId: dto.chapterId, slug },
    });

    return this.toSummary(created);
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryLessonDto) {
    this.assertActorRole(actor);
    const where = {
      chapterId: query.chapterId,
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lesson.findMany({
        where,
        include: { _count: { select: { sections: { where: { status: { not: ContentStatus.ARCHIVED } } } } } },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.lesson.count({ where }),
    ]);
    return {
      data: items.map((item) => this.toSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateLessonDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.lesson.findUnique({
          where: {
            chapterId_slug: { chapterId: record.chapterId, slug: candidate },
          },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException(
            'Slug already in use within this chapter',
          );
        }
        slug = candidate;
      }
    }
    await this.prisma.lesson.updateMany({
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
      action: 'LESSON_UPDATED',
      targetType: 'Lesson',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async updateAccess(actor: RequestUser, id: string, accessType: AccessType) {
    this.assertActorRole(actor); await this.getOrThrow(id);
    await this.prisma.lesson.update({ where: { id }, data: { accessType, updatedById: actor.id } });
    await this.auditService.record({ actorUserId: actor.id, action: 'LESSON_ACCESS_UPDATED', targetType: 'Lesson', targetId: id, metadata: { accessType } });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderLessonDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.chapter.findUnique({
      where: { id: dto.chapterId },
    });
    if (!parent) {
      throw new NotFoundException('Chapter not found');
    }

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.lesson.findMany({ where: { chapterId: dto.chapterId } });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
    await tx.lesson.updateMany({
            where: { id: phase1.id },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id, },
          });
        }
        for (const phase2 of plan.phase2) {
          await tx.lesson.updateMany({
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
      action: 'LESSON_REORDERED',
      targetType: 'Lesson',
      targetId: dto.chapterId,
      metadata: { itemIds: ids },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveLessonDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.chapterId === dto.newChapterId) throw new ConflictException('Use reorder to change position within the same parent');

    const newParent = await this.prisma.chapter.findUnique({
      where: { id: dto.newChapterId },
      include: { course: { include: { subject: true } } },
    });
    if (!newParent) {
      throw new NotFoundException('Chapter not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot move into an archived chapter');
    }
    if (record.status === ContentStatus.PUBLISHED && newParent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('A published lesson must remain under a published chapter');
    }

    const slugCollision = await this.prisma.lesson.findUnique({
      where: {
        chapterId_slug: { chapterId: dto.newChapterId, slug: record.slug },
      },
    });
    if (slugCollision && slugCollision.id !== id) {
      throw new ConflictException(
        'Slug already in use in the target chapter; rename before moving',
      );
    }

    const targetMax = await this.prisma.lesson.aggregate({
      where: { chapterId: dto.newChapterId },
      _max: { sortOrder: true },
    });
    const targetSortOrder =
      dto.sortOrder ?? (dto.newChapterId === record.chapterId ? (targetMax._max.sortOrder ?? 1) : (targetMax._max.sortOrder ?? 0) + 1);
    if (targetSortOrder < 1 || targetSortOrder > (targetMax._max.sortOrder ?? 0) + (dto.newChapterId === record.chapterId ? 0 : 1)) {
      throw new ConflictException('Target sortOrder is outside the sibling scope');
    }
    const oldChapterId = record.chapterId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.lesson.updateMany({
          where: { id },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id, },
        });

        await tx.lesson.updateMany({
          where: { chapterId: oldChapterId, sortOrder: { gt: oldSortOrder } },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id, },
        });

        await tx.lesson.updateMany({
          where: {
            chapterId: dto.newChapterId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id, },
        });

        await tx.lesson.updateMany({
          where: { id },
          data: { chapterId: dto.newChapterId, sortOrder: targetSortOrder, updatedById: actor.id },
        });

        await contentPlacementAncestry.lessonMoved(tx, id, {
          academicGradeId: newParent.course.subject.academicGradeId,
          subjectId: newParent.course.subjectId,
          courseId: newParent.courseId,
          chapterId: newParent.id,
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
      action: 'LESSON_MOVED',
      targetType: 'Lesson',
      targetId: id,
      metadata: { fromChapterId: oldChapterId, toChapterId: dto.newChapterId },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('lesson', id, actor.id);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'LESSON_PUBLISHED',
      targetType: 'Lesson',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);

    await this.publicationService.assertCanArchive('lesson', id);
    await this.prisma.lesson.updateMany({
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
      action: 'LESSON_ARCHIVED',
      targetType: 'Lesson',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.lesson.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'LESSON_RESTORED',
      targetType: 'Lesson',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(
    actor: RequestUser,
    id: string
  ): Promise<void> {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.status !== ContentStatus.DRAFT) {
      throw new ConflictException('Only a draft lesson can be deleted');
    }

    const childCount = await this.prisma.section.count({
      where: { lessonId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete a lesson with sections');
    }
    await this.prisma.lesson.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'LESSON_DELETED',
      targetType: 'Lesson',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    chapterId: string;
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
    _count?: { sections: number };
  }) {
    return {
      id: record.id,
      chapterId: record.chapterId,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      status: record.status,
      accessType: record.accessType,
      coverAssetId: record.coverAssetId,
      hasChildren: (record._count?.sections ?? 0) > 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
    };
  }
}
