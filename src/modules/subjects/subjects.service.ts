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
} from '../../common/hierarchy/hierarchy.helper';
import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';
import type { QuerySubjectDto } from './dto/query-subject.dto';
import type { ReorderSubjectDto } from './dto/reorder-subject.dto';
import type { MoveSubjectDto } from './dto/move-subject.dto';
import { PublicationService } from '../publication/publication.service';
import { contentPlacementAncestry } from '../../common/hierarchy/content-placement-ancestry.helper';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 */
@Injectable()
export class SubjectsService {
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
    const record = await this.prisma.subject.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Subject not found');
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

  async create(actor: RequestUser, dto: CreateSubjectDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.academicGrade.findUnique({
      where: { id: dto.academicGradeId },
    });
    if (!parent) {
      throw new NotFoundException('Academic grade not found');
    }
    if (parent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException(
        'Cannot add subjects to an archived academic grade',
      );
    }

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.subject.findUnique({
      where: {
        academicGradeId_slug: { academicGradeId: dto.academicGradeId, slug },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Slug already in use within this academic grade',
      );
    }

    const maxOrder = await this.prisma.subject.aggregate({
      where: { academicGradeId: dto.academicGradeId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.subject.create({
      data: {
        academicGradeId: dto.academicGradeId,
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
      action: 'SUBJECT_CREATED',
      targetType: 'Subject',
      targetId: created.id,
      metadata: { academicGradeId: dto.academicGradeId, slug },
    });

    return this.toSummary(created);
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QuerySubjectDto) {
    this.assertActorRole(actor);
    const where = {
      academicGradeId: query.academicGradeId,
      status: query.status ?? { not: ContentStatus.ARCHIVED },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.subject.count({ where }),
    ]);
    return {
      data: items.map((item) => this.toSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateSubjectDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.subject.findUnique({
          where: {
            academicGradeId_slug: {
              academicGradeId: record.academicGradeId,
              slug: candidate,
            },
          },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException(
            'Slug already in use within this academic grade',
          );
        }
        slug = candidate;
      }
    }
    await this.prisma.subject.updateMany({
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
      action: 'SUBJECT_UPDATED',
      targetType: 'Subject',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderSubjectDto) {
    this.assertActorRole(actor);

    const parent = await this.prisma.academicGrade.findUnique({
      where: { id: dto.academicGradeId },
    });
    if (!parent) {
      throw new NotFoundException('Academic grade not found');
    }

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.subject.findMany({ where: { academicGradeId: dto.academicGradeId } });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
    await tx.subject.updateMany({
            where: { id: phase1.id },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id, },
          });
        }
        for (const phase2 of plan.phase2) {
          await tx.subject.updateMany({
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
      action: 'SUBJECT_REORDERED',
      targetType: 'Subject',
      targetId: dto.academicGradeId,
      metadata: { itemIds: ids },
    });
  }

  async move(actor: RequestUser, id: string, dto: MoveSubjectDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
    if (record.academicGradeId === dto.newAcademicGradeId) throw new ConflictException('Use reorder to change position within the same parent');

    const newParent = await this.prisma.academicGrade.findUnique({
      where: { id: dto.newAcademicGradeId },
    });
    if (!newParent) {
      throw new NotFoundException('Academic grade not found');
    }
    if (newParent.status === ContentStatus.ARCHIVED) {
      throw new ConflictException(
        'Cannot move into an archived academic grade',
      );
    }
    if (record.status === ContentStatus.PUBLISHED && newParent.status !== ContentStatus.PUBLISHED) {
      throw new ConflictException('A published subject must remain under a published academic grade');
    }

    const slugCollision = await this.prisma.subject.findUnique({
      where: {
        academicGradeId_slug: {
          academicGradeId: dto.newAcademicGradeId,
          slug: record.slug,
        },
      },
    });
    if (slugCollision && slugCollision.id !== id) {
      throw new ConflictException(
        'Slug already in use in the target academic grade; rename before moving',
      );
    }

    const targetMax = await this.prisma.subject.aggregate({
      where: { academicGradeId: dto.newAcademicGradeId },
      _max: { sortOrder: true },
    });
    const targetSortOrder =
      dto.sortOrder ?? (dto.newAcademicGradeId === record.academicGradeId ? (targetMax._max.sortOrder ?? 1) : (targetMax._max.sortOrder ?? 0) + 1);
    if (targetSortOrder < 1 || targetSortOrder > (targetMax._max.sortOrder ?? 0) + (dto.newAcademicGradeId === record.academicGradeId ? 0 : 1)) {
      throw new ConflictException('Target sortOrder is outside the sibling scope');
    }
    const oldAcademicGradeId = record.academicGradeId;
    const oldSortOrder = record.sortOrder;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subject.updateMany({
          where: { id },
          data: { sortOrder: 1_000_000_000, updatedById: actor.id, },
        });

        await tx.subject.updateMany({
          where: {
            academicGradeId: oldAcademicGradeId,
            sortOrder: { gt: oldSortOrder },
          },
          data: { sortOrder: { decrement: 1 }, updatedById: actor.id, },
        });

        await tx.subject.updateMany({
          where: {
            academicGradeId: dto.newAcademicGradeId,
            sortOrder: { gte: targetSortOrder },
          },
          data: { sortOrder: { increment: 1 }, updatedById: actor.id, },
        });

        await tx.subject.updateMany({
          where: { id },
          data: {
            academicGradeId: dto.newAcademicGradeId,
            sortOrder: targetSortOrder,
            updatedById: actor.id,
          },
        });

        await contentPlacementAncestry.subjectMoved(
          tx,
          id,
          dto.newAcademicGradeId,
        );
      });
    } catch (error) {
      this.mapUniqueConstraintError(
        error,
        'Move produced a duplicate sortOrder within a scope',
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SUBJECT_MOVED',
      targetType: 'Subject',
      targetId: id,
      metadata: {
        fromAcademicGradeId: oldAcademicGradeId,
        toAcademicGradeId: dto.newAcademicGradeId,
      },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('subject', id, actor.id);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SUBJECT_PUBLISHED',
      targetType: 'Subject',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);

    await this.publicationService.assertCanArchive('subject', id);
    await this.prisma.subject.updateMany({
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
      action: 'SUBJECT_ARCHIVED',
      targetType: 'Subject',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.subject.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
        },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SUBJECT_RESTORED',
      targetType: 'Subject',
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
      throw new ConflictException('Only a draft subject can be deleted');
    }

    const childCount = await this.prisma.course.count({
      where: { subjectId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete a subject with courses');
    }
    await this.prisma.subject.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'SUBJECT_DELETED',
      targetType: 'Subject',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    academicGradeId: string;
    title: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    status: ContentStatus;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    archivedAt: Date | null;
    coverAssetId: string | null;
  }) {
    return {
      id: record.id,
      academicGradeId: record.academicGradeId,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
      coverAssetId: record.coverAssetId,
    };
  }
}
