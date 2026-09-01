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
import type { CreateAcademicGradeDto } from './dto/create-academic-grade.dto';
import type { UpdateAcademicGradeDto } from './dto/update-academic-grade.dto';
import type { QueryAcademicGradeDto } from './dto/query-academic-grade.dto';
import type { ReorderAcademicGradeDto } from './dto/reorder-academic-grade.dto';
import type { SearchPaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PublicationService } from '../publication/publication.service';
import { paginateArabicSearch } from '../../common/search/arabic-search';
import {
  contentStatusScope,
  publishedScope,
} from '../../common/search/content-scope';

/**
 * Renumber one phase with a single statement. The temporary first phase is
 * still necessary because AcademicGrade.sortOrder is globally unique, but
 * issuing one update per row makes large reorders exceed Prisma's interactive
 * transaction timeout.
 */
function updateAcademicGradeSortOrders(
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
    UPDATE "AcademicGrade" AS grade
    SET "sortOrder" = reordered."sortOrder"${auditFields}
    FROM (VALUES ${rows}) AS reordered(id, "sortOrder")
    WHERE grade.id = reordered.id
  `);
}

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
    private readonly publicationService: PublicationService,
  ) {}

  private assertActorRole(actor: RequestUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getOrThrow(id: string) {
    const record = await this.prisma.academicGrade.findUnique({
      where: { id },
      include: {
        coverAsset: { select: { filename: true } },
        _count: {
          select: {
            subjects: { where: { status: { not: ContentStatus.ARCHIVED } } },
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Academic grade not found');
    }
    return record;
  }

  async create(actor: RequestUser, dto: CreateAcademicGradeDto) {
    this.assertActorRole(actor);

    const slug = dto.slug ?? slugifyOrThrow(dto.title.en);
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
        titleAr: dto.title.ar,
        titleEn: dto.title.en,
        slug,
        descriptionAr: dto.description?.ar,
        descriptionEn: dto.description?.en,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        status: ContentStatus.DRAFT,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_CREATED',
      targetType: 'AcademicGrade',
      targetId: created.id,
      metadata: { slug },
    });

    return this.toSummary(await this.getOrThrow(created.id));
  }

  async getById(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    return this.toSummary(await this.getOrThrow(id));
  }

  async list(actor: RequestUser, query: QueryAcademicGradeDto) {
    this.assertActorRole(actor);
    const where = { status: query.status ?? { not: ContentStatus.ARCHIVED } };
    const { data: items, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.academicGrade,
      target: 'academicGrade',
      q: query.q,
      scope: { where: contentStatusScope(query.status) },
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where,
      args: {
        include: {
          coverAsset: { select: { filename: true } },
          _count: {
            select: {
              subjects: { where: { status: { not: ContentStatus.ARCHIVED } } },
            },
          },
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

  async listPublished(query: SearchPaginationQueryDto) {
    const where = { status: ContentStatus.PUBLISHED };
    const { data: items, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.academicGrade,
      target: 'academicGrade',
      q: query.q,
      scope: { where: publishedScope },
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where,
      args: {
        include: {
          coverAsset: { select: { filename: true } },
          _count: {
            select: {
              subjects: { where: { status: ContentStatus.PUBLISHED } },
            },
          },
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

  async update(actor: RequestUser, id: string, dto: UpdateAcademicGradeDto) {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);

    let slug = record.slug;
    if (dto.slug !== undefined || dto.title !== undefined) {
      const candidate =
        dto.slug ??
        slugifyOrThrow(dto.title?.en ?? record.titleEn ?? record.titleAr);
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
    await this.prisma.academicGrade.updateMany({
      where: { id },
      data: {
        titleAr: dto.title?.ar,
        titleEn: dto.title?.en,
        slug,
        ...(dto.description === undefined
          ? {}
          : {
              descriptionAr: dto.description?.ar ?? null,
              descriptionEn: dto.description?.en ?? null,
            }),
        updatedById: actor.id,
      },
    });

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
    const siblings = await this.prisma.academicGrade.findMany({
      where: { status: { not: ContentStatus.ARCHIVED } },
    });
    assertCompleteSequentialReorder(dto.items, siblings);

    const plan = computeTwoPhaseRenumber(dto.items);

    try {
      await this.prisma.$transaction(async (tx) => {
        await updateAcademicGradeSortOrders(tx, plan.phase1);
        await updateAcademicGradeSortOrders(tx, plan.phase2, actor.id);
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

  async publish(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.publicationService.publish('academicGrade', id, actor.id);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_PUBLISHED',
      targetType: 'AcademicGrade',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async archive(actor: RequestUser, id: string) {
    this.assertActorRole(actor);

    await this.publicationService.assertCanArchive('academicGrade', id);
    await this.prisma.academicGrade.updateMany({
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
      action: 'GRADE_ARCHIVED',
      targetType: 'AcademicGrade',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async restore(actor: RequestUser, id: string) {
    this.assertActorRole(actor);
    await this.prisma.academicGrade.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        publishedAt: null,
        archivedAt: null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_RESTORED',
      targetType: 'AcademicGrade',
      targetId: id,
    });

    return this.toSummary(await this.getOrThrow(id));
  }

  async delete(actor: RequestUser, id: string): Promise<void> {
    this.assertActorRole(actor);
    const record = await this.getOrThrow(id);
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
    await this.prisma.academicGrade.deleteMany({
      where: { id, status: ContentStatus.DRAFT },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'GRADE_DELETED',
      targetType: 'AcademicGrade',
      targetId: id,
    });
  }

  private toSummary(record: {
    id: string;
    titleAr: string;
    titleEn: string | null;
    slug: string;
    descriptionAr: string | null;
    descriptionEn: string | null;
    sortOrder: number;
    status: ContentStatus;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    archivedAt: Date | null;
    coverAssetId: string | null;
    coverAsset?: { filename: string } | null;
    _count?: { subjects: number };
  }) {
    return {
      id: record.id,
      title: { ar: record.titleAr, en: record.titleEn },
      slug: record.slug,
      description: { ar: record.descriptionAr, en: record.descriptionEn },
      sortOrder: record.sortOrder,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      publishedAt: record.publishedAt,
      archivedAt: record.archivedAt,
      coverAssetId: record.coverAssetId,
      coverAssetName: record.coverAsset?.filename ?? null,
      hasChildren: (record._count?.subjects ?? 0) > 0,
    };
  }
}
