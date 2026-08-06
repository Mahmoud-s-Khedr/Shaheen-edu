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
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { StudentCatalogSearchDto } from './dto/student-catalog-search.dto';

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

  async search(studentUserId: string, query: StudentCatalogSearchDto) {
    const grade = await this.gradeFor(studentUserId);
    const subject = await this.prisma.subject.findFirst({
      where: {
        id: query.subjectId,
        academicGradeId: grade.id,
        status: published,
      },
    });
    if (!subject) throw new NotFoundException('Published subject not found');
    const types = this.searchTypes(query.types);
    const cursor = this.searchCursor(query.cursor);
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    const searches: Prisma.Sql[] = [];
    if (types.includes('CHAPTER'))
      searches.push(Prisma.sql`
        SELECT 'CHAPTER'::text AS type, h.id,
          c."sortOrder" AS course_order, h."sortOrder" AS chapter_order,
          -1::int AS lesson_order, -1::int AS section_order, 0::int AS type_order
        FROM "Chapter" h
        JOIN "Course" c ON c.id = h."courseId"
        WHERE h.status = ${published}::"ContentStatus" AND c.status = ${published}::"ContentStatus"
          AND c."subjectId" = ${subject.id}
          AND (h.title ILIKE ${pattern} ESCAPE E'\\' OR h.description ILIKE ${pattern} ESCAPE E'\\')
      `);
    if (types.includes('LESSON'))
      searches.push(Prisma.sql`
        SELECT 'LESSON'::text AS type, l.id,
          c."sortOrder" AS course_order, h."sortOrder" AS chapter_order,
          l."sortOrder" AS lesson_order, -1::int AS section_order, 1::int AS type_order
        FROM "Lesson" l
        JOIN "Chapter" h ON h.id = l."chapterId"
        JOIN "Course" c ON c.id = h."courseId"
        WHERE l.status = ${published}::"ContentStatus" AND h.status = ${published}::"ContentStatus" AND c.status = ${published}::"ContentStatus"
          AND c."subjectId" = ${subject.id}
          AND (l.title ILIKE ${pattern} ESCAPE E'\\' OR l.description ILIKE ${pattern} ESCAPE E'\\')
      `);
    if (types.includes('SECTION'))
      searches.push(Prisma.sql`
        SELECT 'SECTION'::text AS type, x.id,
          c."sortOrder" AS course_order, h."sortOrder" AS chapter_order,
          l."sortOrder" AS lesson_order, x."sortOrder" AS section_order, 2::int AS type_order
        FROM "Section" x
        JOIN "Lesson" l ON l.id = x."lessonId"
        JOIN "Chapter" h ON h.id = l."chapterId"
        JOIN "Course" c ON c.id = h."courseId"
        WHERE x.status = ${published}::"ContentStatus" AND l.status = ${published}::"ContentStatus"
          AND h.status = ${published}::"ContentStatus" AND c.status = ${published}::"ContentStatus"
          AND c."subjectId" = ${subject.id}
          AND (x.title ILIKE ${pattern} ESCAPE E'\\' OR x.description ILIKE ${pattern} ESCAPE E'\\')
      `);
    const rows = await this.prisma.$queryRaw<
      Array<{
        type: 'CHAPTER' | 'LESSON' | 'SECTION';
        id: string;
        course_order: number;
        chapter_order: number;
        lesson_order: number;
        section_order: number;
        type_order: number;
      }>
    >(Prisma.sql`
      SELECT * FROM (${Prisma.join(searches, ' UNION ALL ')}) search
      ${
        cursor
          ? Prisma.sql`
              WHERE (course_order, chapter_order, lesson_order, section_order, type_order, id)
                > (${cursor[0]}, ${cursor[1]}, ${cursor[2]}, ${cursor[3]}, ${cursor[4]}, ${cursor[5]})
            `
          : Prisma.empty
      }
      ORDER BY course_order, chapter_order, lesson_order, section_order, type_order, id
      LIMIT ${query.limit + 1}
    `);
    const page = rows.slice(0, query.limit);
    const [chapters, lessons, sections, grants] = await Promise.all([
      this.prisma.chapter.findMany({
        where: { id: { in: page.filter((row) => row.type === 'CHAPTER').map((row) => row.id) } },
        include: { course: true },
      }),
      this.prisma.lesson.findMany({
        where: { id: { in: page.filter((row) => row.type === 'LESSON').map((row) => row.id) } },
        include: { chapter: { include: { course: true } } },
      }),
      this.prisma.section.findMany({
        where: { id: { in: page.filter((row) => row.type === 'SECTION').map((row) => row.id) } },
        include: { lesson: { include: { chapter: { include: { course: true } } } } },
      }),
      this.activeGrants(studentUserId),
    ]);
    const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const sectionsById = new Map(sections.map((section) => [section.id, section]));
    const data = page.map((row) => {
      if (row.type === 'CHAPTER') {
        const chapter = chaptersById.get(row.id)!;
        return this.searchNode(subject, chapter.course, chapter, null, null, grants);
      }
      if (row.type === 'LESSON') {
        const lesson = lessonsById.get(row.id)!;
        return this.searchNode(subject, lesson.chapter.course, lesson.chapter, lesson, null, grants);
      }
      const section = sectionsById.get(row.id)!;
      return this.searchNode(subject, section.lesson.chapter.course, section.lesson.chapter, section.lesson, section, grants);
    });
    const last = page.at(-1);
    return {
      data,
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(JSON.stringify({ key: [last.course_order, last.chapter_order, last.lesson_order, last.section_order, last.type_order, last.id] })).toString(
                'base64url',
              )
            : null,
      },
    };
  }

  async mySubjects(studentUserId: string, query: PaginationQueryDto) {
    const entitlements = await this.prisma.studentEntitlement.findMany({
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
    const grouped = new Map<string, { subject: any; entitlements: any[] }>();
    for (const entitlement of entitlements) {
      const course = entitlement.course ?? entitlement.chapter?.course;
      const subject = course?.subject;
      if (
        !course ||
        !subject ||
        subject.status !== published ||
        course.status !== published ||
        subject.academicGrade.status !== published ||
        (entitlement.chapter && entitlement.chapter.status !== published)
      )
        continue;
      const group = grouped.get(subject.id) ?? { subject, entitlements: [] };
      group.entitlements.push(entitlement);
      grouped.set(subject.id, group);
    }
    const subjectPage = [...grouped.values()]
      .sort(
        (a, b) =>
          a.subject.sortOrder - b.subject.sortOrder ||
          a.subject.id.localeCompare(b.subject.id),
      )
      .slice((query.page - 1) * query.limit, query.page * query.limit);
    const subjectIds = subjectPage.map(({ subject }) => subject.id);
    const content = await this.prisma.contentItem.findMany({
      where: {
        status: published,
        placement: { is: { subjectId: { in: subjectIds } } },
      },
      include: {
        placement: {
          include: {
            course: { include: { subject: true } },
            chapter: { include: { course: { include: { subject: true } } } },
            lesson: {
              include: {
                chapter: {
                  include: { course: { include: { subject: true } } },
                },
              },
            },
            section: {
              include: {
                lesson: {
                  include: {
                    chapter: {
                      include: { course: { include: { subject: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const accessibleBySubject = new Map<string, any[]>();
    for (const item of content) {
      const path = this.subjectPath(item);
      if (
        !path ||
        !grouped.has(path.subject.id) ||
        path.subject.status !== published ||
        path.nodes.some((node: any) => node.status !== published)
      )
        continue;
      if (this.canAccessLoadedContent(item, entitlements))
        accessibleBySubject.set(path.subject.id, [
          ...(accessibleBySubject.get(path.subject.id) ?? []),
          item,
        ]);
    }
    const completed = new Set(
      (
        await this.prisma.studentContentProgress.findMany({
          where: {
            studentUserId,
            contentItemId: { in: content.map((item) => item.id) },
          },
          select: { contentItemId: true },
        })
      ).map((row) => row.contentItemId),
    );
    const rows = subjectPage.map(({ subject, entitlements: activeEntitlements }) => {
        const items = accessibleBySubject.get(subject.id) ?? [];
        const completedContentItems = items.filter((item) =>
          completed.has(item.id),
        ).length;
        return {
          subject: this.node(subject),
          subscription: {
            state: 'ACTIVE',
            entitlements: activeEntitlements.map((entitlement) => ({
              id: entitlement.id,
              targetType: entitlement.courseId ? 'COURSE' : 'CHAPTER',
              targetId: entitlement.courseId ?? entitlement.chapterId,
              expiresAt: entitlement.expiresAt,
            })),
          },
          progress: {
            totalContentItems: items.length,
            completedContentItems,
            completionPercent: items.length
              ? Math.round((completedContentItems / items.length) * 100)
              : 0,
          },
        };
    });
    return {
      data: rows,
      meta: toPaginationMeta(query.page, query.limit, grouped.size),
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

  private searchTypes(value?: string) {
    if (!value) return ['CHAPTER', 'LESSON', 'SECTION'] as const;
    const types = value
      .split(',')
      .map((type) => type.trim().toUpperCase())
      .filter(Boolean);
    if (
      !types.length ||
      new Set(types).size !== types.length ||
      types.some((type) => !['CHAPTER', 'LESSON', 'SECTION'].includes(type))
    )
      throw new BadRequestException(
        'types must be a comma-separated subset of CHAPTER, LESSON, SECTION',
      );
    return types as Array<'CHAPTER' | 'LESSON' | 'SECTION'>;
  }

  private searchNode(
    subject: any,
    course: any,
    chapter: any,
    lesson: any,
    section: any,
    grants: Grant[],
  ) {
    const node = section ?? lesson ?? chapter;
    const type = section ? 'SECTION' : lesson ? 'LESSON' : 'CHAPTER';
    const pricing = chapter ? this.chapterPricing(chapter, course) : course;
    const accessTypes = [
      node.accessType,
      lesson?.accessType,
      chapter?.accessType,
      course.accessType,
    ].filter(Boolean);
    return {
      ...this.withAccess(
        this.node(node),
        this.access(grants, course.id, chapter?.id, accessTypes, pricing),
      ),
      type,
      breadcrumb: {
        subject: this.node(subject),
        course: this.node(course),
        chapter: this.node(chapter),
        lesson: this.node(lesson),
        section: this.node(section),
      },
    };
  }

  private searchCursor(cursor?: string) {
    if (!cursor) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        !Array.isArray(value.key) ||
        value.key.length !== 6 ||
        !value.key.slice(0, 5).every(Number.isInteger) ||
        typeof value.key[5] !== 'string'
      )
        throw new Error();
      return value.key as [number, number, number, number, number, string];
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private subjectPath(item: any) {
    const placement = item.placement;
    if (!placement) return null;
    if (placement.section) {
      const section = placement.section;
      return {
        subject: section.lesson.chapter.course.subject,
        nodes: [
          section,
          section.lesson,
          section.lesson.chapter,
          section.lesson.chapter.course,
        ],
      };
    }
    if (placement.lesson) {
      const lesson = placement.lesson;
      return {
        subject: lesson.chapter.course.subject,
        nodes: [lesson, lesson.chapter, lesson.chapter.course],
      };
    }
    if (placement.chapter) {
      const chapter = placement.chapter;
      return {
        subject: chapter.course.subject,
        nodes: [chapter, chapter.course],
      };
    }
    if (placement.course)
      return { subject: placement.course.subject, nodes: [placement.course] };
    return null;
  }

  private canAccessLoadedContent(item: any, entitlements: any[]) {
    const path = this.subjectPath(item);
    if (!path) return false;
    const course = path.nodes.at(-1);
    const chapter = path.nodes.find((node: any) => node.courseId);
    const accessTypes = [item.accessType, ...path.nodes.map((node: any) => node.accessType)];
    const effective = this.effectiveAccess(accessTypes);
    if (effective === AccessType.PUBLIC || effective === AccessType.FREE)
      return true;
    return entitlements.some(
      (entitlement) =>
        entitlement.courseId === course.id ||
        (chapter && entitlement.chapterId === chapter.id),
    );
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
  private node(record: any): any {
    if (!record) return null;
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
