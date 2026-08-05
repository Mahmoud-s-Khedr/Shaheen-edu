import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { CatalogCoursesQueryDto } from './dto/catalog-courses-query.dto';
import { CatalogSubjectsQueryDto } from './dto/catalog-subjects-query.dto';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';

const published = ContentStatus.PUBLISHED;
const order = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
const publicNode = (record: any) => ({
  id: record.id,
  title: record.title,
  slug: record.slug,
  description: record.description,
  sortOrder: record.sortOrder,
  coverAssetId: record.coverAssetId ?? null,
  ...(record.accessType ? { accessType: record.accessType } : {}),
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
    const where = { status: published, academicGradeId: query.academicGradeId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        orderBy: order,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.subject.count({ where }),
    ]);
    return {
      data: data.map((record) => publicNode(record)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async courses(query: CatalogCoursesQueryDto) {
    const where = { status: published, subjectId: query.subjectId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: order,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.course.count({ where }),
    ]);
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
        subject: { status: published, academicGrade: { status: published } },
      },
      include: { subject: { include: { academicGrade: true } } },
    });
    if (!record) throw new NotFoundException('Published course not found');
    return {
      ...publicNode(record),
      subject: publicNode(record.subject),
      academicGrade: publicNode(record.subject.academicGrade),
    };
  }

  private cursor(cursor?: string) {
    if (!cursor) return undefined;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (!Number.isInteger(value.sortOrder) || typeof value.id !== 'string')
        throw new Error();
      return value as { sortOrder: number; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }
  private page(items: any[], limit: number) {
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
                JSON.stringify({ sortOrder: last.sortOrder, id: last.id }),
              ).toString('base64url')
            : null,
      },
    };
  }
  private placementPage(items: any[], limit: number) {
    const rows = items.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(publicItem),
      pageInfo: {
        hasNextPage: items.length > limit,
        nextCursor:
          items.length > limit && last
            ? Buffer.from(
                JSON.stringify({ sortOrder: last.sortOrder, id: last.id }),
              ).toString('base64url')
            : null,
      },
    };
  }
  private after(cursor?: string) {
    const value = this.cursor(cursor);
    return value
      ? {
          OR: [
            { sortOrder: { gt: value.sortOrder } },
            { sortOrder: value.sortOrder, id: { gt: value.id } },
          ],
        }
      : {};
  }

  async chapters(courseId: string, query: CursorPaginationQueryDto) {
    const parent = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        status: published,
        subject: { status: published, academicGrade: { status: published } },
      },
    });
    if (!parent) throw new NotFoundException('Published course not found');
    const items = await this.prisma.chapter.findMany({
      where: { courseId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit),
    };
  }
  async lessons(chapterId: string, query: CursorPaginationQueryDto) {
    const parent = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: published,
        course: {
          status: published,
          subject: { status: published, academicGrade: { status: published } },
        },
      },
    });
    if (!parent) throw new NotFoundException('Published chapter not found');
    const items = await this.prisma.lesson.findMany({
      where: { chapterId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit),
    };
  }
  async sections(lessonId: string, query: CursorPaginationQueryDto) {
    const parent = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        status: published,
        chapter: {
          status: published,
          course: {
            status: published,
            subject: {
              status: published,
              academicGrade: { status: published },
            },
          },
        },
      },
    });
    if (!parent) throw new NotFoundException('Published lesson not found');
    const items = await this.prisma.section.findMany({
      where: { lessonId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.page(items.map(publicNode), query.limit),
    };
  }
  async contentItems(
    resource: string,
    id: string,
    query: CursorPaginationQueryDto,
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
        subject: { status: published, academicGrade: { status: published } },
      },
      chapters: {
        course: {
          status: published,
          subject: { status: published, academicGrade: { status: published } },
        },
      },
      lessons: {
        chapter: {
          status: published,
          course: {
            status: published,
            subject: {
              status: published,
              academicGrade: { status: published },
            },
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
              subject: {
                status: published,
                academicGrade: { status: published },
              },
            },
          },
        },
      },
    };
    if (!models[resource])
      throw new BadRequestException('Unsupported catalog resource');
    const parent = await models[resource].findFirst({
      where: { id, status: published, ...ancestry[resource] },
    });
    if (!parent)
      throw new NotFoundException('Published hierarchy record not found');
    const items = await this.prisma.contentPlacement.findMany({
      where: {
        [field[resource]]: id,
        contentItem: { status: published },
        ...this.after(query.cursor),
      },
      include: { contentItem: true },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: publicNode(parent),
      ...this.placementPage(items, query.limit),
    };
  }
}
