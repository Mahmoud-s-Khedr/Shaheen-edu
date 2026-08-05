/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Prisma's nested catalogue response is rendered through deliberately narrow learner DTOs. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  ContentStatus,
  EntitlementStatus,
} from '../../common/types/roles.enum';
import {
  toPaginationMeta,
  type PaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';

const published = ContentStatus.PUBLISHED;
const order = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

type Grant = {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  expiresAt: Date | null;
};
type Pricing = {
  isPurchasable: boolean;
  priceMinor: number | null;
  currency: string | null;
};

@Injectable()
export class StudentCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(studentUserId: string) {
    const grade = await this.gradeFor(studentUserId);
    const [subjects, courses, chapters] = await this.prisma.$transaction([
      this.prisma.subject.count({
        where: { academicGradeId: grade.id, status: published },
      }),
      this.prisma.course.count({
        where: {
          status: published,
          subject: { academicGradeId: grade.id, status: published },
        },
      }),
      this.prisma.chapter.count({
        where: {
          status: published,
          course: {
            status: published,
            subject: { academicGradeId: grade.id, status: published },
          },
        },
      }),
    ]);
    return {
      academicGrade: this.gradeDto(grade),
      summary: { subjects, courses, chapters },
    };
  }

  async subjects(studentUserId: string, query: PaginationQueryDto) {
    const grade = await this.gradeFor(studentUserId);
    const where = { academicGradeId: grade.id, status: published };
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
      data: data.map((subject) => this.node(subject)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async courses(
    studentUserId: string,
    subjectId: string,
    query: PaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, academicGradeId: grade.id, status: published },
    });
    if (!subject) throw new NotFoundException('Published subject not found');
    const grants = await this.activeGrants(studentUserId);
    const where = { subjectId, status: published };
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
      data: data.map((course) =>
        this.withAccess(
          this.node(course),
          this.access(
            grants,
            course.id,
            undefined,
            [course.accessType],
            course,
          ),
        ),
      ),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async course(studentUserId: string, courseId: string) {
    const grade = await this.gradeFor(studentUserId);
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        status: published,
        subject: {
          academicGradeId: grade.id,
          status: published,
          academicGrade: { status: published },
        },
      },
      include: { subject: true },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = await this.activeGrants(studentUserId);
    return {
      ...this.withAccess(
        this.node(course),
        this.access(grants, course.id, undefined, [course.accessType], course),
      ),
      subject: this.node(course.subject),
    };
  }

  async chapters(
    studentUserId: string,
    courseId: string,
    query: CursorPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        status: published,
        subject: {
          academicGradeId: grade.id,
          status: published,
          academicGrade: { status: published },
        },
      },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = await this.activeGrants(studentUserId);
    const rows = await this.prisma.chapter.findMany({
      where: { courseId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    return {
      parent: this.withAccess(
        this.node(course),
        this.access(grants, course.id, undefined, [course.accessType], course),
      ),
      ...this.page(
        rows.map((chapter) =>
          this.withAccess(
            this.node(chapter),
            this.access(
              grants,
              course.id,
              chapter.id,
              [chapter.accessType, course.accessType],
              this.chapterPricing(chapter, course),
            ),
          ),
        ),
        query.limit,
      ),
    };
  }

  async lessons(
    studentUserId: string,
    chapterId: string,
    query: CursorPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: published,
        course: {
          status: published,
          subject: {
            academicGradeId: grade.id,
            status: published,
            academicGrade: { status: published },
          },
        },
      },
      include: { course: true },
    });
    if (!chapter) throw new NotFoundException('Published chapter not found');
    const grants = await this.activeGrants(studentUserId);
    const rows = await this.prisma.lesson.findMany({
      where: { chapterId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    const access = (record: any) =>
      this.access(
        grants,
        chapter.courseId,
        chapter.id,
        [record.accessType, chapter.accessType, chapter.course.accessType],
        this.chapterPricing(chapter, chapter.course),
      );
    return {
      parent: this.withAccess(this.node(chapter), access(chapter)),
      ...this.page(
        rows.map((lesson) =>
          this.withAccess(this.node(lesson), access(lesson)),
        ),
        query.limit,
      ),
    };
  }

  async sections(
    studentUserId: string,
    lessonId: string,
    query: CursorPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        status: published,
        chapter: {
          status: published,
          course: {
            status: published,
            subject: {
              academicGradeId: grade.id,
              status: published,
              academicGrade: { status: published },
            },
          },
        },
      },
      include: { chapter: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Published lesson not found');
    const grants = await this.activeGrants(studentUserId);
    const chapter = lesson.chapter;
    const rows = await this.prisma.section.findMany({
      where: { lessonId, status: published, ...this.after(query.cursor) },
      orderBy: order,
      take: query.limit + 1,
    });
    const access = (record: any) =>
      this.access(
        grants,
        chapter.courseId,
        chapter.id,
        [
          record.accessType,
          lesson.accessType,
          chapter.accessType,
          chapter.course.accessType,
        ],
        this.chapterPricing(chapter, chapter.course),
      );
    return {
      parent: this.withAccess(this.node(lesson), access(lesson)),
      ...this.page(
        rows.map((section) =>
          this.withAccess(this.node(section), access(section)),
        ),
        query.limit,
      ),
    };
  }

  async contentItems(
    studentUserId: string,
    resource: string,
    id: string,
    query: CursorPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const configs: Record<string, any> = {
      courses: {
        model: this.prisma.course,
        field: 'courseId',
        include: { subject: true },
        course: (x: any) => x,
        chapter: () => undefined,
        accesses: (x: any) => [x.accessType],
        pricing: (x: any) => x,
        where: {
          subject: {
            academicGradeId: grade.id,
            status: published,
            academicGrade: { status: published },
          },
        },
      },
      chapters: {
        model: this.prisma.chapter,
        field: 'chapterId',
        include: { course: true },
        course: (x: any) => x.course,
        chapter: (x: any) => x,
        accesses: (x: any) => [x.accessType, x.course.accessType],
        pricing: (x: any) => this.chapterPricing(x, x.course),
        where: {
          course: {
            status: published,
            subject: {
              academicGradeId: grade.id,
              status: published,
              academicGrade: { status: published },
            },
          },
        },
      },
      lessons: {
        model: this.prisma.lesson,
        field: 'lessonId',
        include: { chapter: { include: { course: true } } },
        course: (x: any) => x.chapter.course,
        chapter: (x: any) => x.chapter,
        accesses: (x: any) => [
          x.accessType,
          x.chapter.accessType,
          x.chapter.course.accessType,
        ],
        pricing: (x: any) => this.chapterPricing(x.chapter, x.chapter.course),
        where: {
          chapter: {
            status: published,
            course: {
              status: published,
              subject: {
                academicGradeId: grade.id,
                status: published,
                academicGrade: { status: published },
              },
            },
          },
        },
      },
      sections: {
        model: this.prisma.section,
        field: 'sectionId',
        include: {
          lesson: { include: { chapter: { include: { course: true } } } },
        },
        course: (x: any) => x.lesson.chapter.course,
        chapter: (x: any) => x.lesson.chapter,
        accesses: (x: any) => [
          x.accessType,
          x.lesson.accessType,
          x.lesson.chapter.accessType,
          x.lesson.chapter.course.accessType,
        ],
        pricing: (x: any) =>
          this.chapterPricing(x.lesson.chapter, x.lesson.chapter.course),
        where: {
          lesson: {
            status: published,
            chapter: {
              status: published,
              course: {
                status: published,
                subject: {
                  academicGradeId: grade.id,
                  status: published,
                  academicGrade: { status: published },
                },
              },
            },
          },
        },
      },
    };
    const config = configs[resource];
    if (!config) throw new BadRequestException('Unsupported catalog resource');
    const parent = await config.model.findFirst({
      where: { id, status: published, ...config.where },
      include: config.include,
    });
    if (!parent)
      throw new NotFoundException('Published hierarchy record not found');
    const grants = await this.activeGrants(studentUserId);
    const course = config.course(parent);
    const chapter = config.chapter(parent);
    const rows = await this.prisma.contentPlacement.findMany({
      where: {
        [config.field]: id,
        contentItem: { status: published },
        ...this.after(query.cursor),
      },
      include: { contentItem: true },
      orderBy: order,
      take: query.limit + 1,
    });
    const parentAccess = this.access(
      grants,
      course.id,
      chapter?.id,
      config.accesses(parent),
      config.pricing(parent),
    );
    const render = (placement: any) =>
      this.withAccess(
        this.contentItem(placement.contentItem, placement.sortOrder),
        this.access(
          grants,
          course.id,
          chapter?.id,
          [placement.contentItem.accessType, ...config.accesses(parent)],
          config.pricing(parent),
        ),
      );
    return {
      parent: this.withAccess(this.node(parent), parentAccess),
      ...this.placementPage(rows, query.limit, render),
    };
  }

  async library(studentUserId: string) {
    const records = await this.prisma.studentEntitlement.findMany({
      where: this.activeGrantWhere(studentUserId),
      include: {
        course: { include: { subject: { include: { academicGrade: true } } } },
        chapter: {
          include: {
            course: {
              include: { subject: { include: { academicGrade: true } } },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const data = records.flatMap((record) => {
      const course = record.course ?? record.chapter?.course;
      const grade = course?.subject.academicGrade;
      if (
        !course ||
        !grade ||
        course.status !== published ||
        course.subject.status !== published ||
        grade.status !== published ||
        (record.chapter && record.chapter.status !== published)
      )
        return [];
      const target = record.course
        ? this.node(record.course)
        : this.node(record.chapter!);
      return [
        {
          entitlementId: record.id,
          targetType: record.courseId ? 'COURSE' : 'CHAPTER',
          target,
          course: this.node(course),
          subject: this.node(course.subject),
          academicGrade: this.gradeDto(grade),
          startsAt: record.startsAt,
          expiresAt: record.expiresAt,
        },
      ];
    });
    return { data: [...data, ...(await this.archivedLibrary(studentUserId))] };
  }

  private async archivedLibrary(studentUserId: string) {
    const snapshots = await (
      this.prisma as any
    ).archivedAccessSnapshot.findMany({
      where: { studentUserId, revokedAt: null },
      orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
    });
    const rows: any[] = [];
    for (const snapshot of snapshots) {
      const record = await this.archivedRecord(
        snapshot.resourceType,
        snapshot.resourceId,
      );
      if (!record) continue;
      const path = this.archivedPath(snapshot.resourceType, record);
      rows.push({
        archivedAccessSnapshotId: snapshot.id,
        targetType: snapshot.resourceType,
        target: this.node(record),
        course: path.course ? this.node(path.course) : null,
        subject: path.subject ? this.node(path.subject) : null,
        academicGrade: path.grade ? this.gradeDto(path.grade) : null,
        retainedAccess: true,
        archivedAt: snapshot.archivedAt,
      });
    }
    return rows;
  }

  private async archivedRecord(type: string, id: string): Promise<any> {
    if (type === 'ACADEMIC_GRADE')
      return this.prisma.academicGrade.findUnique({ where: { id } });
    if (type === 'SUBJECT')
      return this.prisma.subject.findUnique({
        where: { id },
        include: { academicGrade: true },
      });
    if (type === 'COURSE')
      return this.prisma.course.findUnique({
        where: { id },
        include: { subject: { include: { academicGrade: true } } },
      });
    if (type === 'CHAPTER')
      return this.prisma.chapter.findUnique({
        where: { id },
        include: {
          course: {
            include: { subject: { include: { academicGrade: true } } },
          },
        },
      });
    if (type === 'LESSON')
      return this.prisma.lesson.findUnique({
        where: { id },
        include: {
          chapter: {
            include: {
              course: {
                include: { subject: { include: { academicGrade: true } } },
              },
            },
          },
        },
      });
    if (type === 'SECTION')
      return this.prisma.section.findUnique({
        where: { id },
        include: {
          lesson: {
            include: {
              chapter: {
                include: {
                  course: {
                    include: { subject: { include: { academicGrade: true } } },
                  },
                },
              },
            },
          },
        },
      });
    return null;
  }

  private archivedPath(type: string, record: any) {
    if (type === 'ACADEMIC_GRADE')
      return { grade: record, subject: null, course: null };
    if (type === 'SUBJECT')
      return { grade: record.academicGrade, subject: record, course: null };
    if (type === 'COURSE')
      return {
        grade: record.subject.academicGrade,
        subject: record.subject,
        course: record,
      };
    if (type === 'CHAPTER')
      return {
        grade: record.course.subject.academicGrade,
        subject: record.course.subject,
        course: record.course,
      };
    if (type === 'LESSON')
      return {
        grade: record.chapter.course.subject.academicGrade,
        subject: record.chapter.course.subject,
        course: record.chapter.course,
      };
    return {
      grade: record.lesson.chapter.course.subject.academicGrade,
      subject: record.lesson.chapter.course.subject,
      course: record.lesson.chapter.course,
    };
  }

  async entitlements(studentUserId: string, query: PaginationQueryDto) {
    const where = this.activeGrantWhere(studentUserId);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentEntitlement.findMany({
        where,
        select: {
          id: true,
          courseId: true,
          chapterId: true,
          source: true,
          status: true,
          startsAt: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentEntitlement.count({ where }),
    ]);
    return {
      data: data.map((record) => ({
        ...record,
        targetType: record.courseId ? 'COURSE' : 'CHAPTER',
        targetId: record.courseId ?? record.chapterId,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
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
  private placementPage(
    items: any[],
    limit: number,
    render: (placement: any) => any,
  ) {
    const rows = items.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(render),
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

  private async gradeFor(studentUserId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
      include: { academicGrade: true },
    });
    if (
      !profile?.academicGradeId ||
      !profile.academicGrade ||
      profile.academicGrade.status !== published
    )
      throw new ConflictException('Student academic grade must be published');
    return profile.academicGrade;
  }

  private activeGrantWhere(studentUserId: string) {
    const now = new Date();
    return {
      studentUserId,
      status: EntitlementStatus.ACTIVE,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  private async activeGrants(studentUserId: string): Promise<Grant[]> {
    return this.prisma.studentEntitlement.findMany({
      where: this.activeGrantWhere(studentUserId),
      select: { id: true, courseId: true, chapterId: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private access(
    grants: Grant[],
    courseId: string,
    chapterId: string | undefined,
    accessTypes: AccessType[],
    pricing: Pricing,
  ) {
    const grant = grants.find(
      (item) =>
        item.courseId === courseId ||
        (chapterId !== undefined && item.chapterId === chapterId),
    );
    const state = grant
      ? 'ENTITLED'
      : this.effectiveAccess(accessTypes) === AccessType.PUBLIC
        ? 'PUBLIC'
        : this.effectiveAccess(accessTypes) === AccessType.FREE
          ? 'FREE'
          : pricing.isPurchasable
            ? 'PURCHASABLE'
            : 'LOCKED';
    return {
      state,
      ...(grant ? { entitlementId: grant.id, expiresAt: grant.expiresAt } : {}),
      ...(pricing.isPurchasable &&
      pricing.priceMinor !== null &&
      pricing.currency
        ? {
            price: {
              amountMinor: pricing.priceMinor,
              currency: pricing.currency,
            },
          }
        : {}),
    };
  }

  private effectiveAccess(values: AccessType[]) {
    return (
      values.find((value) => value !== AccessType.INHERIT) ?? AccessType.PAID
    );
  }
  private chapterPricing(
    chapter: {
      isPurchasable: boolean | null;
      priceMinor: number | null;
      currency: string | null;
    },
    course: Pricing,
  ): Pricing {
    return chapter.isPurchasable === null
      ? course
      : {
          isPurchasable: chapter.isPurchasable,
          priceMinor: chapter.priceMinor,
          currency: chapter.currency,
        };
  }
  private node(record: any) {
    return {
      id: record.id,
      title: record.title,
      slug: record.slug,
      description: record.description,
      sortOrder: record.sortOrder,
      coverAssetId: record.coverAssetId ?? null,
    };
  }
  private gradeDto(grade: any) {
    return {
      id: grade.id,
      title: { ar: grade.titleAr, en: grade.titleEn },
      slug: grade.slug,
      description: { ar: grade.descriptionAr, en: grade.descriptionEn },
      sortOrder: grade.sortOrder,
      coverAssetId: grade.coverAssetId ?? null,
    };
  }
  private contentItem(item: any, sortOrder: number) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      estimatedDuration: item.estimatedDuration,
      sortOrder,
    };
  }
  private withAccess(node: Record<string, unknown>, access: { state: string }) {
    return {
      ...node,
      access,
      isLocked: access.state === 'LOCKED' || access.state === 'PURCHASABLE',
    };
  }
}
