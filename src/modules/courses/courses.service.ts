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
import type { CreateCourseDto } from './dto/create-course.dto';
import type { UpdateCourseDto } from './dto/update-course.dto';
import type { QueryCourseDto } from './dto/query-course.dto';
import {
  paginateArabicSearch,
  sqlAnd,
} from '../../common/search/arabic-search';
import { contentStatusScope } from '../../common/search/content-scope';
import type { ReorderCourseDto } from './dto/reorder-course.dto';
import type { MoveCourseDto } from './dto/move-course.dto';
import { PublicationService } from '../publication/publication.service';
import { contentPlacementAncestry } from '../../common/hierarchy/content-placement-ancestry.helper';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 */
@Injectable()
export class CoursesService {
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
    const record = await this.prisma.course.findUnique({
      where: { id },
      include: {
        subject: { select: { title: true } },
        coverAsset: { select: { filename: true } },
        _count: {
          select: {
            chapters: { where: { status: { not: ContentStatus.ARCHIVED } } },
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Course not found');
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

  async create(actor: RequestUser, dto: CreateCourseDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      include: { gradeAssignments: { select: { academicGradeId: true } } },
    });
    if (!parent) {
      throw new NotFoundException('Subject not found');
    }
    if (parent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot add courses to an archived subject');
    }
    const gradeIds = parent.gradeAssignments.map((x) => x.academicGradeId);
    const academicGradeId =
      dto.academicGradeId ?? (gradeIds.length === 1 ? gradeIds[0] : undefined);
    if (!academicGradeId || !gradeIds.includes(academicGradeId))
      throw new ConflictException(
        'Course academic grade must be one of the subject grades',
      );

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.course.findFirst({
      where: { subjectId: dto.subjectId, academicGradeId, slug },
    });
    if (existing) {
      throw new ConflictException('Slug already in use within this subject');
    }

    const maxOrder = await this.prisma.course.aggregate({
      where: { subjectId: dto.subjectId, academicGradeId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.course.create({
      data: {
        subjectId: dto.subjectId,
        academicGradeId,
        title: dto.title,
        slug,
        description: dto.description,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        status: ContentStatus.DRAFT,
        accessType: dto.accessType,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'COURSE_CREATED',
      targetType: 'Course',
      targetId: created.id,
      metadata: { subjectId: dto.subjectId, academicGradeId, slug },
    });

    return this.toSummary(await this.getOrThrow(created.id));
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toReadSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryCourseDto) {
    this.assertActorRole(actor);
    const where = {
      subjectId: query.subjectId,
      academicGradeId: query.academicGradeId,
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const { data: items, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.course,
      target: 'course',
      q: query.q,
      scope: {
        where: sqlAnd(
          contentStatusScope(query.status),
          query.subjectId
            ? Prisma.sql`t."subjectId" = ${query.subjectId}`
            : undefined,
          query.academicGradeId
            ? Prisma.sql`t."academicGradeId" = ${query.academicGradeId}`
            : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where,
      args: {
        include: {
          subject: { select: { title: true } },
          coverAsset: { select: { filename: true } },
          _count: {
            select: {
              chapters: { where: { status: { not: ContentStatus.ARCHIVED } } },
            },
          },
        },
      },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: items.map((item) => this.toReadSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateCourseDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.course.findFirst({
          where: {
            subjectId: record.subjectId,
            academicGradeId: record.academicGradeId,
            slug: candidate,
          },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException(
            'Slug already in use within this subject',
          );
        }
        slug = candidate;
      }
    }
    await this.prisma.course.updateMany({
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
      action: 'COURSE_UPDATED',
      targetType: 'Course',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async updateAccess(actor: RequestUser, id: string, accessType: AccessType) {
    this.assertActorRole(actor);
    if (accessType === AccessType.INHERIT) {
      throw new ConflictException('A course must have an explicit access type');
    }
    await this.getOrThrow(id);
    await this.prisma.course.update({
      where: { id },
      data: { accessType, updatedById: actor.id },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'COURSE_ACCESS_UPDATED',
      targetType: 'Course',
      targetId: id,
      metadata: { accessType },
    });
    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderCourseDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
    });
    if (!parent) {
      throw new NotFoundException('Subject not found');
    }

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.course.findMany({
      where: {
        subjectId: dto.subjectId,
        academicGradeId: dto.academicGradeId,
      },
    });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
          await tx.course.updateMany({
            where: { id: phase1.id },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id },
          });
        }
        for (const phase2 of plan.phase2) {
          await tx.course.updateMany({
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
      action: 'COURSE_REORDERED',
      targetType: 'Course',
      targetId: dto.subjectId,
      metadata: { academicGradeId: dto.academicGradeId, itemIds: ids },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveCourseDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.subjectId === dto.newSubjectId)
      throw new ConflictException(
        'Use reorder to change position within the same parent',
      );

    const newParent = await this.prisma.subject.findUnique({
      where: { id: dto.newSubjectId },
    });
    if (!newParent) {
      throw new NotFoundException('Subject not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException('Cannot move into an archived subject');
    }
    if (
      record.status === ContentStatus.PUBLISHED &&
      newParent.status !== ContentStatus.PUBLISHED
    ) {
      throw new ConflictException(
        'A published course must remain under a published subject',
      );
    }

    const targetGradeId = record.academicGradeId ?? newParent.academicGradeId;
    const membership = await this.prisma.subjectGrade.findUnique({
      where: {
        academicGradeId_subjectId: {
          academicGradeId: targetGradeId,
          subjectId: dto.newSubjectId,
        },
      },
    });
    if (!membership)
      throw new ConflictException(
        'Target subject is not available in this course grade',
      );
    const slugCollision = await this.prisma.course.findFirst({
      where: {
        subjectId: dto.newSubjectId,
        academicGradeId: targetGradeId,
        slug: record.slug,
      },
    });
    if (slugCollision && slugCollision.id !== id) {
      throw new ConflictException(
        'Slug already in use in the target subject; rename before moving',
      );
    }

    const targetMax = await this.prisma.course.aggregate({
      where: { subjectId: dto.newSubjectId, academicGradeId: targetGradeId },
      _max: { sortOrder: true },
    });
    const targetSortOrder =
      dto.sortOrder ??
      (dto.newSubjectId === record.subjectId
        ? (targetMax._max.sortOrder ?? 1)
        : (targetMax._max.sortOrder ?? 0) + 1);
    if (
      targetSortOrder < 1 ||
      targetSortOrder >
        (targetMax._max.sortOrder ?? 0) +
          (dto.newSubjectId === record.subjectId ? 0 : 1)
    ) {
      throw new ConflictException(
        'Target sortOrder is outside the sibling scope',
      );
    }
    const oldSubjectId = record.subjectId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.course.updateMany({
          where: { id },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id },
        });

        await tx.course.updateMany({
          where: {
            subjectId: oldSubjectId,
            academicGradeId: record.academicGradeId,
            sortOrder: { gt: oldSortOrder },
          },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id },
        });

        await tx.course.updateMany({
          where: {
            subjectId: dto.newSubjectId,
            academicGradeId: targetGradeId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id },
        });

        await tx.course.updateMany({
          where: { id },
          data: {
            subjectId: dto.newSubjectId,
            academicGradeId: targetGradeId,
            sortOrder: targetSortOrder,
            updatedById: actor.id,
          },
        });

        await contentPlacementAncestry.courseMoved(tx, id, {
          academicGradeId: targetGradeId,
          subjectId: newParent.id,
          courseId: id,
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
      action: 'COURSE_MOVED',
      targetType: 'Course',
      targetId: id,
      metadata: { fromSubjectId: oldSubjectId, toSubjectId: dto.newSubjectId },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('course', id, actor.id);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'COURSE_PUBLISHED',
      targetType: 'Course',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);

    await this.publicationService.assertCanArchive('course', id);
    await this.prisma.course.updateMany({
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
      action: 'COURSE_ARCHIVED',
      targetType: 'Course',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.course.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'COURSE_RESTORED',
      targetType: 'Course',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(actor: RequestUser, id: string): Promise<void> {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.status !== ContentStatus.DRAFT) {
      throw new ConflictException('Only a draft course can be deleted');
    }

    const childCount = await this.prisma.chapter.count({
      where: { courseId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete a course with chapters');
    }
    await this.prisma.course.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'COURSE_DELETED',
      targetType: 'Course',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    subjectId: string;
    academicGradeId: string | null;
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
    subject?: { title: string };
    _count?: { chapters: number };
  }) {
    return {
      id: record.id,
      subjectId: record.subjectId,
      academicGradeId: record.academicGradeId,
      subjectName: record.subject?.title ?? null,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      status: record.status,
      accessType: record.accessType,
      coverAssetId: record.coverAssetId,
      coverAssetName: record.coverAsset?.filename ?? null,
      hasChildren: (record._count?.chapters ?? 0) > 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
    };
  }

  private toReadSummary(record: {
    id: string;
    subjectId: string;
    academicGradeId: string | null;
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
    isPurchasable: boolean;
    priceMinor: number | null;
    currency: string | null;
    subject?: { title: string };
  }) {
    return {
      ...this.toSummary(record),
      pricing: {
        isPurchasable: record.isPurchasable,
        priceMinor: record.isPurchasable ? record.priceMinor : null,
        currency: record.isPurchasable ? record.currency : null,
        resolvedFrom: { courseId: record.id, courseName: record.title },
      },
    };
  }
}
