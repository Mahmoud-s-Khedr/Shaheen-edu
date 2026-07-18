import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContentStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  computeTwoPhaseRenumber,
  slugifyOrThrow,
  assertCompleteSequentialReorder,
  versionConflict,
} from '../../common/hierarchy/hierarchy.helper';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';
import type { QueryChapterDto } from './dto/query-chapter.dto';
import type { ReorderChapterDto } from './dto/reorder-chapter.dto';
import type { MoveChapterDto } from './dto/move-chapter.dto';
import type { VersionOnlyDto } from '../../common/dto/version-only.dto';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 */
@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private assertActorRole(actor: RequestUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getOrThrow(id: string) {
    const record = await this.prisma.chapter.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Chapter not found');
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

  async create(actor: RequestUser, dto: CreateChapterDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!parent) {
      throw new NotFoundException('Course not found');
    }
    if (parent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot add chapters to an archived course');
    }

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.chapter.findUnique({
      where: { courseId_slug: { courseId: dto.courseId, slug } },
    });
    if (existing) {
      throw new ConflictException('Slug already in use within this course');
    }

    const maxOrder = await this.prisma.chapter.aggregate({
      where: { courseId: dto.courseId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.chapter.create({
      data: {
        courseId: dto.courseId,
        title: dto.title,
        slug,
        description: dto.description,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        status: ContentStatus.DRAFT,
        createdById: actor.id,
        updatedById: actor.id,
        version: 1,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_CREATED',
      targetType: 'Chapter',
      targetId: created.id,
      metadata: { courseId: dto.courseId, slug },
    });

    return this.toSummary(created);
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryChapterDto) {
    this.assertActorRole(actor);
    const where = {
      courseId: query.courseId,
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chapter.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.chapter.count({ where }),
    ]);
    return {
      data: items.map((item) => this.toSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateChapterDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.chapter.findUnique({
          where: {
            courseId_slug: { courseId: record.courseId, slug: candidate },
          },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException('Slug already in use within this course');
        }
        slug = candidate;
      }
    }

    const result = await this.prisma.chapter.updateMany({
      where: { id, version: dto.version },
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        updatedById: actor.id,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) versionConflict();

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_UPDATED',
      targetType: 'Chapter',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderChapterDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });
    if (!parent) {
      throw new NotFoundException('Course not found');
    }

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.chapter.findMany({ where: { courseId: dto.courseId } });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);
    const versionById = new Map(
      dto.items.map((item) => [item.id, item.version]),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
          const result = await tx.chapter.updateMany({
            where: { id: phase1.id, version: versionById.get(phase1.id) },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id, version: { increment: 1 } },
          });
          if (result.count === 0) versionConflict();
        }
        for (const phase2 of plan.phase2) {
          await tx.chapter.updateMany({
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
      action: 'CHAPTER_REORDERED',
      targetType: 'Chapter',
      targetId: dto.courseId,
      metadata: { itemIds: ids },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveChapterDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    const newParent = await this.prisma.course.findUnique({
      where: { id: dto.newCourseId },
    });
    if (!newParent) {
      throw new NotFoundException('Course not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot move into an archived course');
    }
    if (record.status === ContentStatus.PUBLISHED && newParent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('A published chapter must remain under a published course');
    }

    const slugCollision = await this.prisma.chapter.findUnique({
      where: {
        courseId_slug: { courseId: dto.newCourseId, slug: record.slug },
      },
    });
    if (slugCollision && slugCollision.id !== id) {
      throw new ConflictException(
        'Slug already in use in the target course; rename before moving',
      );
    }

    const targetMax = await this.prisma.chapter.aggregate({
      where: { courseId: dto.newCourseId },
      _max: { sortOrder: true },
    });
    const targetSortOrder =
      dto.sortOrder ?? (dto.newCourseId === record.courseId ? (targetMax._max.sortOrder ?? 1) : (targetMax._max.sortOrder ?? 0) + 1);
    if (targetSortOrder < 1 || targetSortOrder > (targetMax._max.sortOrder ?? 0) + (dto.newCourseId === record.courseId ? 0 : 1)) {
      throw new ConflictException('Target sortOrder is outside the sibling scope');
    }
    const oldCourseId = record.courseId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        const preMove = await tx.chapter.updateMany({
          where: { id, version: dto.version },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id, version: { increment: 1 } },
        });
        if (preMove.count === 0) versionConflict();

        await tx.chapter.updateMany({
          where: { courseId: oldCourseId, sortOrder: { gt: oldSortOrder } },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id, version: { increment: 1 } },
        });

        await tx.chapter.updateMany({
          where: {
            courseId: dto.newCourseId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id, version: { increment: 1 } },
        });

        await tx.chapter.updateMany({
          where: { id },
          data: { courseId: dto.newCourseId, sortOrder: targetSortOrder, updatedById: actor.id },
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
      action: 'CHAPTER_MOVED',
      targetType: 'Chapter',
      targetId: id,
      metadata: { fromCourseId: oldCourseId, toCourseId: dto.newCourseId },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    const parent = await this.prisma.course.findUnique({
      where: { id: record.courseId },
    });
    if (!parent || parent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('Parent course must be published first');
    }

    const result = await this.prisma.chapter.updateMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      const current = await this.getOrThrow(id);
      if (current.version !== dto.version) versionConflict();
      throw new ConflictException('Only a draft chapter can be published');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_PUBLISHED',
      targetType: 'Chapter',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    // TODO(phase-5): block archiving when published descendants exist, once
    // PublicationValidator owns that cascade check.
    const result = await this.prisma.chapter.updateMany({
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
    if (result.count === 0) {
      const record = await this.getOrThrow(id);
      if (record.version !== dto.version) versionConflict();
      throw new ConflictException('Chapter is already archived');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_ARCHIVED',
      targetType: 'Chapter',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    const result = await this.prisma.chapter.updateMany({
      where: { id, version: dto.version, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      const record = await this.getOrThrow(id);
      if (record.version !== dto.version) versionConflict();
      throw new ConflictException('Only an archived chapter can be restored');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_RESTORED',
      targetType: 'Chapter',
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
    const record = await this.getOrThrow(id);
    if (record.version !== dto.version) versionConflict();
    if (record.status !== ContentStatus.DRAFT) {
      throw new ConflictException('Only a draft chapter can be deleted');
    }

    const childCount = await this.prisma.lesson.count({
      where: { chapterId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete a chapter with lessons');
    }

    const result = await this.prisma.chapter.deleteMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
    });
    if (result.count === 0) versionConflict();

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'CHAPTER_DELETED',
      targetType: 'Chapter',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    courseId: string;
    title: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    status: ContentStatus;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    archivedAt: Date | null;
    version: number;
  }) {
    return {
      id: record.id,
      courseId: record.courseId,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
      version: record.version,
    };
  }
}
