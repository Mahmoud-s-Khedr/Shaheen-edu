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
import type { CreateSectionDto } from './dto/create-section.dto';
import type { UpdateSectionDto } from './dto/update-section.dto';
import type { QuerySectionDto } from './dto/query-section.dto';
import type { ReorderSectionDto } from './dto/reorder-section.dto';
import type { MoveSectionDto } from './dto/move-section.dto';
import type { VersionOnlyDto } from '../../common/dto/version-only.dto';

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
  ) {}

  private assertActorRole(actor: RequestUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getOrThrow(id: string) {
    const record = await this.prisma.section.findUnique({ where: { id } });
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
        version: 1,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_CREATED',
      targetType: 'Section',
      targetId: created.id,
      metadata: { lessonId: dto.lessonId, slug },
    });

    return this.toSummary(created);
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
    const [items, total] = await this.prisma.$transaction([
      this.prisma.section.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.section.count({ where }),
    ]);
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

    const result = await this.prisma.section.updateMany({
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
      action: 'SECTION_UPDATED',
      targetType: 'Section',
      targetId: id,
      metadata: { slug },
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
    const siblings = await this.prisma.section.findMany({ where: { lessonId: dto.lessonId } });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);
    const versionById = new Map(
      dto.items.map((item) => [item.id, item.version]),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
          const result = await tx.section.updateMany({
            where: { id: phase1.id, version: versionById.get(phase1.id) },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id, version: { increment: 1 } },
          });
          if (result.count === 0) versionConflict();
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

    const newParent = await this.prisma.lesson.findUnique({
      where: { id: dto.newLessonId },
    });
    if (!newParent) {
      throw new NotFoundException('Lesson not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot move into an archived lesson');
    }
    if (record.status === ContentStatus.PUBLISHED && newParent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('A published section must remain under a published lesson');
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
      dto.sortOrder ?? (dto.newLessonId === record.lessonId ? (targetMax._max.sortOrder ?? 1) : (targetMax._max.sortOrder ?? 0) + 1);
    if (targetSortOrder < 1 || targetSortOrder > (targetMax._max.sortOrder ?? 0) + (dto.newLessonId === record.lessonId ? 0 : 1)) {
      throw new ConflictException('Target sortOrder is outside the sibling scope');
    }
    const oldLessonId = record.lessonId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        const preMove = await tx.section.updateMany({
          where: { id, version: dto.version },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id, version: { increment: 1 } },
        });
        if (preMove.count === 0) versionConflict();

        await tx.section.updateMany({
          where: { lessonId: oldLessonId, sortOrder: { gt: oldSortOrder } },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id, version: { increment: 1 } },
        });

        await tx.section.updateMany({
          where: {
            lessonId: dto.newLessonId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id, version: { increment: 1 } },
        });

        await tx.section.updateMany({
          where: { id },
          data: { lessonId: dto.newLessonId, sortOrder: targetSortOrder, updatedById: actor.id },
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

  async publish(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    const parent = await this.prisma.lesson.findUnique({
      where: { id: record.lessonId },
    });
    if (!parent || parent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('Parent lesson must be published first');
    }

    const result = await this.prisma.section.updateMany({
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
      throw new ConflictException('Only a draft section can be published');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_PUBLISHED',
      targetType: 'Section',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    // TODO(phase-5): block archiving when published descendants exist, once
    // PublicationValidator owns that cascade check.
    const result = await this.prisma.section.updateMany({
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
      throw new ConflictException('Section is already archived');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_ARCHIVED',
      targetType: 'Section',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    const result = await this.prisma.section.updateMany({
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
      throw new ConflictException('Only an archived section can be restored');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SECTION_RESTORED',
      targetType: 'Section',
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
      throw new ConflictException('Only a draft section can be deleted');
    }

    const result = await this.prisma.section.deleteMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
    });
    if (result.count === 0) versionConflict();

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
    version: number;
  }) {
    return {
      id: record.id,
      lessonId: record.lessonId,
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
