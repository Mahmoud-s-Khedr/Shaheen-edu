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
import type { CreateAcademicGradeDto } from './dto/create-academic-grade.dto';
import type { UpdateAcademicGradeDto } from './dto/update-academic-grade.dto';
import type { QueryAcademicGradeDto } from './dto/query-academic-grade.dto';
import type { ReorderAcademicGradeDto } from './dto/reorder-academic-grade.dto';
import type { VersionOnlyDto } from '../../common/dto/version-only.dto';

/**
 * NOTE: this level models only the DRAFT/PUBLISHED/ARCHIVED lifecycle and the
 * minimal "publish only if parent is published" rule Phase 1 requires.
 * Phase 5's PublicationService/PublicationValidator will later extend
 * publish-time validation (full ancestry, asset readiness, etc.).
 */
@Injectable()
export class AcademicGradesService {
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
    const record = await this.prisma.academicGrade.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Academic grade not found');
    }
    return record;
  }

  async create(actor: RequestUser, dto: CreateAcademicGradeDto) {
    this.assertActorRole(actor);

    const slug = dto.slug ?? slugifyOrThrow(dto.title);
    const existing = await this.prisma.academicGrade.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException('Slug already in use');
    }

    const maxOrder = await this.prisma.academicGrade.aggregate({
      _max: { sortOrder: true },
    });
    const created = await this.prisma.academicGrade.create({
      data: {
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
      action: 'GRADE_CREATED',
      targetType: 'AcademicGrade',
      targetId: created.id,
      metadata: { slug },
    });

    return this.toSummary(created);
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryAcademicGradeDto) {
    this.assertActorRole(actor);
    const where = { status: query.status ?? { not: ContentStatus.ARCHIVED } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicGrade.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.academicGrade.count({ where }),
    ]);
    return {
      data: items.map((item) => this.toSummary(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async update(actor: RequestUser, id: string, dto: UpdateAcademicGradeDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate = dto.slug ?? slugifyOrThrow(dto.title ?? record.title);
      if (candidate !== record.slug) {
        const collision = await this.prisma.academicGrade.findUnique({
          where: { slug: candidate },
        });
        if (collision && collision.id !== id) {
          throw new ConflictException('Slug already in use');
        }
        slug = candidate;
      }
    }

    const result = await this.prisma.academicGrade.updateMany({
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
      action: 'GRADE_UPDATED',
      targetType: 'AcademicGrade',
      targetId: id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async reorder(actor: RequestUser, dto: ReorderAcademicGradeDto) {
    this.assertActorRole(actor);

    const ids = dto.items.map((item) => item.id);
    const siblings = await this.prisma.academicGrade.findMany();
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);
    const versionById = new Map(
      dto.items.map((item) => [item.id, item.version]),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const phase1 of plan.phase1) {
          const result = await tx.academicGrade.updateMany({
            where: { id: phase1.id, version: versionById.get(phase1.id) },
            data: { sortOrder: phase1.sortOrder, updatedById: actor.id, version: { increment: 1 } },
          });
          if (result.count === 0) versionConflict();
        }
        for (const phase2 of plan.phase2) {
          await tx.academicGrade.updateMany({
            where: { id: phase2.id },
            data: { sortOrder: phase2.sortOrder },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Reorder produced a duplicate sortOrder within this scope',
        );
      }
      throw error;
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_REORDERED',
      targetType: 'AcademicGrade',
      targetId: 'batch',
      metadata: { itemIds: ids },
    });
  }

  async publish(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    const result = await this.prisma.academicGrade.updateMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      const record = await this.getOrThrow(id);
      if (record.version !== dto.version) versionConflict();
      throw new ConflictException(
        'Only a draft academic grade can be published',
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_PUBLISHED',
      targetType: 'AcademicGrade',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    // TODO(phase-5): block archiving when published descendants exist, once
    // PublicationValidator owns that cascade check.
    const result = await this.prisma.academicGrade.updateMany({
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
      throw new ConflictException('Academic grade is already archived');
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_ARCHIVED',
      targetType: 'AcademicGrade',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string, dto: VersionOnlyDto) {
    this.assertActorRole(actor);

    const result = await this.prisma.academicGrade.updateMany({
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
      throw new ConflictException(
        'Only an archived academic grade can be restored',
      );
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_RESTORED',
      targetType: 'AcademicGrade',
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
      throw new ConflictException('Only a draft academic grade can be deleted');
    }

    const childCount = await this.prisma.subject.count({
      where: { academicGradeId: id },
    });
    if (childCount > 0) {
      throw new ConflictException(
        'Cannot delete an academic grade with subjects',
      );
    }

    const result = await this.prisma.academicGrade.deleteMany({
      where: { id, version: dto.version, status: ContentStatus.DRAFT },
    });
    if (result.count === 0) versionConflict();

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_DELETED',
      targetType: 'AcademicGrade',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
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
