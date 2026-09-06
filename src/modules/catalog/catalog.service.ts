import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContentStatus } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { CatalogCoursesQueryDto } from './dto/catalog-courses-query.dto';
import { CatalogSubjectsQueryDto } from './dto/catalog-subjects-query.dto';
import { SearchCursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import {
  normalizeArabic,
  paginateArabicSearch,
  searchArabicOffsetPage,
  searchArabicIds,
  searchNeedle,
  sqlAnd,
} from '../../common/search/arabic-search';
import {
  publishedScope,
  sortOrderSql,
} from '../../common/search/content-scope';

const published = ContentStatus.PUBLISHED;
const order = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
const publicNode = (record: any) => ({
  id: record.id,
  title: record.title,
  slug: record.slug,
  description: record.description,
  sortOrder: record.sortOrder,
  coverAssetId: record.coverAssetId ?? null,
  coverAssetName: record.coverAsset?.filename ?? null,
  ...(record.accessType ? { accessType: record.accessType } : {}),
  ...(record._count
    ? { hasChildren: (Object.values(record._count)[0] as number) > 0 }
    : {}),
});
const publicItem = (placement: any) => ({
  id: placement.contentItem.id,
  type: placement.contentItem.type,
  title: placement.contentItem.title,
  description: placement.contentItem.description,
  estimatedDuration: placement.contentItem.estimatedDuration,
  accessType: placement.contentItem.accessType,
  sortOrder: placement.sortOrder,
});

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async subjects(query: CatalogSubjectsQueryDto) {
    if (query.academicGradeId)
      return this.subjectsForGrade(query.academicGradeId, query);
    const where = {
      status: published,
    };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.subject,
      target: 'subject',
      q: query.q,
      scope: {
        where: publishedScope,
      },
      orderBySql: sortOrderSql,
      orderBy: order,
      where,
      args: {
        include: {
          coverAsset: { select: { filename: true } },
          _count: { select: { courses: { where: { status: published } } } },
        },
      },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: data.map((record) => publicNode(record)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  private async subjectsForGrade(
    academicGradeId: string,
    query: CatalogSubjectsQueryDto,
  ) {
    const where = {
      academicGradeId,
      subject: { status: published },
    };
    const include = {
      subject: {
        include: {
          coverAsset: { select: { filename: true } },
          _count: {
            select: {
              courses: { where: { academicGradeId, status: published } },
            },
          },
        },
      },
    };
    const needle = searchNeedle(query.q);
    if (!needle) {
      const [assignments, total] = await this.prisma.$transaction([
        this.prisma.subjectGrade.findMany({
          where,
          include,
          orderBy: [{ sortOrder: 'asc' }, { subjectId: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.subjectGrade.count({ where }),
      ]);
      return {
        data: assignments.map((assignment) =>
          publicNode({
            ...assignment.subject,
            sortOrder: assignment.sortOrder,
          }),
        ),
        meta: toPaginationMeta(query.page, query.limit, total),
      };
    }
    const page = await searchArabicOffsetPage(this.prisma, 'subject', needle, {
      scope: {
        join: Prisma.sql`JOIN "SubjectGrade" sg ON sg."subjectId" = t.id`,
        where: Prisma.sql`${publishedScope} AND sg."academicGradeId" = ${academicGradeId}`,
      },
      orderBy: Prisma.sql`sg."sortOrder" ASC, t.id ASC`,
      page: query.page,
      limit: query.limit,
    });
    const assignments = page.ids.length
      ? await this.prisma.subjectGrade.findMany({
          where: { ...where, subjectId: { in: page.ids } },
          include,
        })
      : [];
    const bySubjectId = new Map(
      assignments.map((assignment) => [assignment.subjectId, assignment]),
    );
    return {
      data: page.ids.flatMap((subjectId) => {
        const assignment = bySubjectId.get(subjectId);
        return assignment
          ? [
              publicNode({
                ...assignment.subject,
                sortOrder: assignment.sortOrder,
              }),
            ]
          : [];
      }),
      meta: toPaginationMeta(query.page, query.limit, page.total),
    };
  }

  async courses(query: CatalogCoursesQueryDto) {
    if (query.subjectId && !query.academicGradeId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: query.subjectId },
        select: { _count: { select: { gradeAssignments: true } } },
      });
      if (subject && subject._count.gradeAssignments > 1)
        throw new BadRequestException(
          'academicGradeId is required when listing courses for a shared subject',
        );
    }
    const where = {
      status: published,
      subjectId: query.subjectId,
      academicGradeId: query.academicGradeId,
    };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.course,
      target: 'course',
      q: query.q,
      scope: {
        where: sqlAnd(
          publishedScope,
          query.subjectId
            ? Prisma.sql`t."subjectId" = ${query.subjectId}`
            : undefined,
          query.academicGradeId
            ? Prisma.sql`t."academicGradeId" = ${query.academicGradeId}`
            : undefined,
        ),
      },
      orderBySql: sortOrderSql,
      orderBy: order,
      where,
      args: {
        include: {
          coverAsset: { select: { filename: true } },
          _count: { select: { chapters: { where: { status: published } } } },
        },
      },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: data.map((record) => publicNode(record)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async course(id: string) {
    const record = await this.prisma.course.findFirst({
      where: {
        id,
        status: published,
        subject: { status: published },
        academicGrade: { status: published },
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { chapters: { where: { status: published } } } },
        subject: {
          include: {
            coverAsset: { select: { filename: true } },
            _count: { select: { courses: { where: { status: published } } } },
          },
        },
        academicGrade: {
          include: {
            coverAsset: { select: { filename: true } },
            _count: {
              select: {
                subjectAssignments: {
                  where: { subject: { status: published } },
                },
              },
            },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Published course not found');
    const [chapters, lessons, sections] = await this.prisma.$transaction([
      this.prisma.chapter.count({
        where: { courseId: record.id, status: published },
      }),
      this.prisma.lesson.count({
        where: {
          chapter: { courseId: record.id, status: published },
          status: published,
        },
      }),
      this.prisma.section.count({
        where: {
          lesson: {
            chapter: { courseId: record.id, status: published },
            status: published,
          },
          status: published,
        },
      }),
    ]);
    return {
      ...publicNode(record),
      subject: publicNode(record.subject),
      academicGrade: publicNode(record.academicGrade),
      contentCounts: { chapters, lessons, sections },
    };
  }

  private cursor(cursor?: string, q?: string) {
    if (!cursor) return undefined;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        !Number.isInteger(value.sortOrder) ||
        typeof value.id !== 'string' ||
        (value.q ?? '') !== normalizeArabic(q ?? '')
      )
        throw new Error();
      return value as { sortOrder: number; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
  private page(items: any[], limit: number, q?: string) {
    const hasNextPage = items.length > limit;
    const data = items.slice(0, limit);
    const last = data.at(-1);
    return {
      data,
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? Buffer.from(
                JSON.stringify({
                  sortOrder: last.sortOrder,
                  id: last.id,
                  q: normalizeArabic(q ?? ''),
                }),
              ).toString('base64url')
            : null,
      },
    };
  }
  private placementPage(items: any[], limit: number, q?: string) {
    const rows = items.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(publicItem),
      pageInfo: {
        hasNextPage: items.length > limit,
        nextCursor:
          items.length > limit && last
            ? Buffer.from(
                JSON.stringify({
                  sortOrder: last.sortOrder,
                  id: last.id,
                  q: normalizeArabic(q ?? ''),
                }),
              ).toString('base64url')
            : null,
      },
    };
  }
  private after(cursor?: string, q?: string) {
    const value = this.cursor(cursor, q);
    return value
      ? {
          OR: [
            { sortOrder: { gt: value.sortOrder } },
            { sortOrder: value.sortOrder, id: { gt: value.id } },
          ],
        }
      : {};
  }

  async chapters(courseId: string, query: SearchCursorPaginationQueryDto) {
    const parent = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        status: published,
        subject: { status: published },
        academicGrade: { status: published },
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { chapters: { where: { status: published } } } },
      },
    });
    if (!parent) throw new NotFoundException('Published course not found');
    const ids = await searchArabicIds(this.prisma, 'chapter', query.q, {
      where: Prisma.sql`t."courseId" = ${courseId} AND ${publishedScope}`,
    });
    const items = await this.prisma.chapter.findMany({
      where: {
        courseId,
        status: published,
        ...(ids ? { id: { in: ids } } : {}),
        ...this.after(query.cursor, query.q),
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { lessons: { where: { status: published } } } },
      },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit, query.q),
    };
  }
  async lessons(chapterId: string, query: SearchCursorPaginationQueryDto) {
    const parent = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: published,
        course: {
          status: published,
          subject: { status: published },
          academicGrade: { status: published },
        },
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { lessons: { where: { status: published } } } },
      },
    });
    if (!parent) throw new NotFoundException('Published chapter not found');
    const ids = await searchArabicIds(this.prisma, 'lesson', query.q, {
      where: Prisma.sql`t."chapterId" = ${chapterId} AND ${publishedScope}`,
    });
    const items = await this.prisma.lesson.findMany({
      where: {
        chapterId,
        status: published,
        ...(ids ? { id: { in: ids } } : {}),
        ...this.after(query.cursor, query.q),
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { sections: { where: { status: published } } } },
      },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit, query.q),
    };
  }
  async sections(lessonId: string, query: SearchCursorPaginationQueryDto) {
    const parent = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        status: published,
        chapter: {
          status: published,
          course: {
            status: published,
            subject: { status: published },
            academicGrade: { status: published },
          },
        },
      },
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { sections: { where: { status: published } } } },
      },
    });
    if (!parent) throw new NotFoundException('Published lesson not found');
    const ids = await searchArabicIds(this.prisma, 'section', query.q, {
      where: Prisma.sql`t."lessonId" = ${lessonId} AND ${publishedScope}`,
    });
    const items = await this.prisma.section.findMany({
      where: {
        lessonId,
        status: published,
        ...(ids ? { id: { in: ids } } : {}),
        ...this.after(query.cursor, query.q),
      },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit, query.q),
    };
  }
  async contentItems(
    resource: string,
    id: string,
    query: SearchCursorPaginationQueryDto,
  ) {
    const models: Record<string, any> = {
      courses: this.prisma.course,
      chapters: this.prisma.chapter,
      lessons: this.prisma.lesson,
      sections: this.prisma.section,
    };
    const field: Record<string, string> = {
      courses: 'courseId',
      chapters: 'chapterId',
      lessons: 'lessonId',
      sections: 'sectionId',
    };
    const ancestry: Record<string, any> = {
      courses: {
        subject: { status: published },
        academicGrade: { status: published },
      },
      chapters: {
        course: {
          status: published,
          subject: { status: published },
          academicGrade: { status: published },
        },
      },
      lessons: {
        chapter: {
          status: published,
          course: {
            status: published,
            subject: { status: published },
            academicGrade: { status: published },
          },
        },
      },
      sections: {
        lesson: {
          status: published,
          chapter: {
            status: published,
            course: {
              status: published,
              subject: { status: published },
              academicGrade: { status: published },
            },
          },
        },
      },
    };
    const childCounts: Record<string, any> = {
      courses: {
        _count: { select: { chapters: { where: { status: published } } } },
      },
      chapters: {
        _count: { select: { lessons: { where: { status: published } } } },
      },
      lessons: {
        _count: { select: { sections: { where: { status: published } } } },
      },
      sections: {},
    };
    if (!models[resource])
      throw new BadRequestException('Unsupported catalog resource');
    const parent = await models[resource].findFirst({
      where: { id, status: published, ...ancestry[resource] },
      include: childCounts[resource],
    });
    if (!parent)
      throw new NotFoundException('Published hierarchy record not found');
    const ids = await searchArabicIds(this.prisma, 'contentItem', query.q, {
      join: Prisma.sql`JOIN "ContentPlacement" p ON p."contentItemId" = t.id`,
      where: Prisma.sql`${Prisma.raw(`p."${field[resource]}"`)} = ${id} AND ${publishedScope}`,
    });
    const items = await this.prisma.contentPlacement.findMany({
      where: {
        [field[resource]]: id,
        contentItem: {
          status: published,
          ...(ids ? { id: { in: ids } } : {}),
        },
        ...this.after(query.cursor, query.q),
      },
      include: { contentItem: true },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.placementPage(items, query.limit, query.q),
    };
  }
}
