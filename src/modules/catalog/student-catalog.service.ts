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
  type SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SearchCursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { StudentCatalogSearchDto } from './dto/student-catalog-search.dto';
import { arabicMatchText, normalizeArabic, paginateArabicSearch, searchArabicIds, searchNeedle, sqlAnd } from '../../common/search/arabic-search';
import { publishedScope, sortOrderSql } from '../../common/search/content-scope';
import { nodeMatches } from '../../common/search/node-match';
import { CompletionService, type CompletionContainerType } from '../completion/completion.service';

const published = ContentStatus.PUBLISHED;
const order = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];

type Grant = {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  course?: { title: string } | null;
  chapter?: { title: string } | null;
  expiresAt: Date | null;
};
type Pricing = {
  isPurchasable: boolean;
  priceMinor: number | null;
  currency: string | null;
};

@Injectable()
export class StudentCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
  ) {}

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

  async subjects(studentUserId: string, query: SearchPaginationQueryDto) {
    const grade = await this.gradeFor(studentUserId);
    const where = { academicGradeId: grade.id, status: published };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.subject,
      target: 'subject',
      q: query.q,
      scope: { where: sqlAnd(publishedScope, Prisma.sql`t."academicGradeId" = ${grade.id}`) },
      orderBySql: sortOrderSql,
      orderBy: order,
      where,
      args: { include: { coverAsset: { select: { filename: true } }, _count: { select: { courses: { where: { status: published } } } } } },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: data.map((subject) => this.node(subject)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async courses(
    studentUserId: string,
    subjectId: string,
    query: SearchPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, academicGradeId: grade.id, status: published },
      include: { coverAsset: { select: { filename: true } }, _count: { select: { courses: { where: { status: published } } } } },
    });
    if (!subject) throw new NotFoundException('Published subject not found');
    const grants = await this.activeGrants(studentUserId);
    const where = { subjectId, status: published };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.course,
      target: 'course',
      q: query.q,
      scope: { where: sqlAnd(publishedScope, Prisma.sql`t."subjectId" = ${subjectId}`) },
      orderBySql: sortOrderSql,
      orderBy: order,
      where,
      args: { include: { coverAsset: { select: { filename: true } }, _count: { select: { chapters: { where: { status: published } } } } } },
      page: query.page,
      limit: query.limit,
    });
    const completions = await this.completion.containers(
      studentUserId,
      data.map((course) => ({ id: course.id, type: 'course' as const })),
    );
    return {
      data: data.map((course) =>
        this.withCompletion(
          this.withAccess(
            this.node(course),
            this.access(grants, course.id, undefined, [course.accessType], course),
          ),
          'course',
          completions,
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
    const searchQuery = searchNeedle(query.q)!;
    const cursor = this.searchCursor(query.cursor, searchQuery);
    const normalizedQuery = normalizeArabic(searchQuery);
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
          AND (
            ${arabicMatchText(Prisma.sql`arabic_normalize(coalesce(h.title, '') || ' ' || coalesce(h.slug, '') || ' ' || coalesce(h.description, ''))`, searchQuery)}
            OR to_tsvector('simple', arabic_normalize(coalesce(h.title, '') || ' ' || coalesce(h.slug, '') || ' ' || coalesce(h.description, ''))) @@ plainto_tsquery('simple', ${normalizedQuery})
            OR (length(${normalizedQuery}) >= 3 AND similarity(arabic_normalize(coalesce(h.title, '') || ' ' || coalesce(h.slug, '') || ' ' || coalesce(h.description, '')), ${normalizedQuery}) >= 0.35)
          )
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
          AND (
            ${arabicMatchText(Prisma.sql`arabic_normalize(coalesce(l.title, '') || ' ' || coalesce(l.slug, '') || ' ' || coalesce(l.description, ''))`, searchQuery)}
            OR to_tsvector('simple', arabic_normalize(coalesce(l.title, '') || ' ' || coalesce(l.slug, '') || ' ' || coalesce(l.description, ''))) @@ plainto_tsquery('simple', ${normalizedQuery})
            OR (length(${normalizedQuery}) >= 3 AND similarity(arabic_normalize(coalesce(l.title, '') || ' ' || coalesce(l.slug, '') || ' ' || coalesce(l.description, '')), ${normalizedQuery}) >= 0.35)
          )
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
          AND (
            ${arabicMatchText(Prisma.sql`arabic_normalize(coalesce(x.title, '') || ' ' || coalesce(x.slug, '') || ' ' || coalesce(x.description, ''))`, searchQuery)}
            OR to_tsvector('simple', arabic_normalize(coalesce(x.title, '') || ' ' || coalesce(x.slug, '') || ' ' || coalesce(x.description, ''))) @@ plainto_tsquery('simple', ${normalizedQuery})
            OR (length(${normalizedQuery}) >= 3 AND similarity(arabic_normalize(coalesce(x.title, '') || ' ' || coalesce(x.slug, '') || ' ' || coalesce(x.description, '')), ${normalizedQuery}) >= 0.35)
          )
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
    const completions = await this.completion.containers(
      studentUserId,
      data.flatMap((hit) => [
        { id: hit.breadcrumb.course.id, type: 'course' as const },
        ...(hit.breadcrumb.chapter ? [{ id: hit.breadcrumb.chapter.id, type: 'chapter' as const }] : []),
        ...(hit.breadcrumb.lesson ? [{ id: hit.breadcrumb.lesson.id, type: 'lesson' as const }] : []),
        ...(hit.breadcrumb.section ? [{ id: hit.breadcrumb.section.id, type: 'section' as const }] : []),
      ]),
    );
    const completedData = data.map((hit) => ({
      ...this.withCompletion(hit, hit.type.toLowerCase() as CompletionContainerType, completions),
      breadcrumb: {
        ...hit.breadcrumb,
        course: this.withCompletion(hit.breadcrumb.course, 'course', completions),
        chapter: hit.breadcrumb.chapter && this.withCompletion(hit.breadcrumb.chapter, 'chapter', completions),
        lesson: hit.breadcrumb.lesson && this.withCompletion(hit.breadcrumb.lesson, 'lesson', completions),
        section: hit.breadcrumb.section && this.withCompletion(hit.breadcrumb.section, 'section', completions),
      },
    }));
    const last = page.at(-1);
    return {
      data: completedData,
      pageInfo: {
        hasNextPage: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(JSON.stringify({ key: [last.course_order, last.chapter_order, last.lesson_order, last.section_order, last.type_order, last.id], q: normalizeArabic(searchQuery) })).toString(
                'base64url',
              )
            : null,
      },
    };
  }

  async mySubjects(studentUserId: string, query: SearchPaginationQueryDto) {
    // Rejects a query that normalizes to nothing (e.g. "!!!") instead of
    // matching everything, matching subjects() and the catalogue endpoints.
    searchNeedle(query.q);
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
    const matchingSubjects = [...grouped.values()]
      .filter(({ subject }) => this.nodeMatches(subject, query.q));
    const subjectPage = matchingSubjects
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
              targetName: entitlement.course?.title ?? entitlement.chapter?.title ?? null,
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
      meta: toPaginationMeta(query.page, query.limit, matchingSubjects.length),
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
      include: {
        coverAsset: { select: { filename: true } },
        _count: { select: { chapters: { where: { status: published } } } },
        subject: { include: { coverAsset: { select: { filename: true } }, _count: { select: { courses: { where: { status: published } } } } } },
      },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = await this.activeGrants(studentUserId);
    const completions = await this.completion.containers(studentUserId, [
      { id: course.id, type: 'course' },
    ]);
    return {
      ...this.withCompletion(
        this.withAccess(
          this.node(course),
          this.access(grants, course.id, undefined, [course.accessType], course),
        ),
        'course',
        completions,
      ),
      subject: this.node(course.subject),
    };
  }

  async chapters(
    studentUserId: string,
    courseId: string,
    query: SearchCursorPaginationQueryDto,
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
      include: { coverAsset: { select: { filename: true } }, _count: { select: { chapters: { where: { status: published } } } } },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = await this.activeGrants(studentUserId);
    const ids = await searchArabicIds(this.prisma, 'chapter', query.q, {
      where: Prisma.sql`t."courseId" = ${courseId} AND ${publishedScope}`,
    });
    const rows = await this.prisma.chapter.findMany({
      where: { courseId, status: published, ...(ids ? { id: { in: ids } } : {}), ...this.after(query.cursor, query.q) },
      include: { coverAsset: { select: { filename: true } }, _count: { select: { lessons: { where: { status: published } } } } },
      orderBy: order,
      take: query.limit + 1,
    });
    const completions = await this.completion.containers(studentUserId, [
      { id: course.id, type: 'course' },
      ...rows.map((chapter) => ({ id: chapter.id, type: 'chapter' as const })),
    ]);
    return {
      parent: this.withCompletion(this.withAccess(
        this.node(course),
        this.access(grants, course.id, undefined, [course.accessType], course),
      ), 'course', completions),
      ...this.page(
        rows.map((chapter) =>
          this.withCompletion(this.withAccess(
            this.node(chapter),
            this.access(
              grants,
              course.id,
              chapter.id,
              [chapter.accessType, course.accessType],
              this.chapterPricing(chapter, course),
            ),
          ), 'chapter', completions),
        ),
        query.limit, query.q,
      ),
    };
  }

  async lessons(
    studentUserId: string,
    chapterId: string,
    query: SearchCursorPaginationQueryDto,
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
      include: {
        course: true,
        coverAsset: { select: { filename: true } },
        _count: { select: { lessons: { where: { status: published } } } },
      },
    });
    if (!chapter) throw new NotFoundException('Published chapter not found');
    const grants = await this.activeGrants(studentUserId);
    const ids = await searchArabicIds(this.prisma, 'lesson', query.q, {
      where: Prisma.sql`t."chapterId" = ${chapterId} AND ${publishedScope}`,
    });
    const rows = await this.prisma.lesson.findMany({
      where: { chapterId, status: published, ...(ids ? { id: { in: ids } } : {}), ...this.after(query.cursor, query.q) },
      include: { coverAsset: { select: { filename: true } }, _count: { select: { sections: { where: { status: published } } } } },
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
    const completions = await this.completion.containers(studentUserId, [
      { id: chapter.id, type: 'chapter' },
      ...rows.map((lesson) => ({ id: lesson.id, type: 'lesson' as const })),
    ]);
    return {
      parent: this.withCompletion(this.withAccess(this.node(chapter), access(chapter)), 'chapter', completions),
      ...this.page(
        rows.map((lesson) =>
          this.withCompletion(this.withAccess(this.node(lesson), access(lesson)), 'lesson', completions),
        ),
        query.limit, query.q,
      ),
    };
  }

  async sections(
    studentUserId: string,
    lessonId: string,
    query: SearchCursorPaginationQueryDto,
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
      include: {
        chapter: { include: { course: true } },
        coverAsset: { select: { filename: true } },
        _count: { select: { sections: { where: { status: published } } } },
      },
    });
    if (!lesson) throw new NotFoundException('Published lesson not found');
    const grants = await this.activeGrants(studentUserId);
    const chapter = lesson.chapter;
    const ids = await searchArabicIds(this.prisma, 'section', query.q, {
      where: Prisma.sql`t."lessonId" = ${lessonId} AND ${publishedScope}`,
    });
    const rows = await this.prisma.section.findMany({
      where: { lessonId, status: published, ...(ids ? { id: { in: ids } } : {}), ...this.after(query.cursor, query.q) },
      include: { coverAsset: { select: { filename: true } } },
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
    const completions = await this.completion.containers(studentUserId, [
      { id: lesson.id, type: 'lesson' },
      ...rows.map((section) => ({ id: section.id, type: 'section' as const })),
    ]);
    return {
      parent: this.withCompletion(this.withAccess(this.node(lesson), access(lesson)), 'lesson', completions),
      ...this.page(
        rows.map((section) =>
          this.withCompletion(this.withAccess(this.node(section), access(section)), 'section', completions),
        ),
        query.limit, query.q,
      ),
    };
  }

  async contentItems(
    studentUserId: string,
    resource: string,
    id: string,
    query: SearchCursorPaginationQueryDto,
  ) {
    const grade = await this.gradeFor(studentUserId);
    const configs: Record<string, any> = {
      courses: {
        model: this.prisma.course,
        field: 'courseId',
        include: {
          subject: true,
          _count: { select: { chapters: { where: { status: published } } } },
        },
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
        include: {
          course: true,
          _count: { select: { lessons: { where: { status: published } } } },
        },
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
        include: {
          chapter: { include: { course: true } },
          _count: { select: { sections: { where: { status: published } } } },
        },
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
    const ids = await searchArabicIds(this.prisma, 'contentItem', query.q, {
      join: Prisma.sql`JOIN "ContentPlacement" p ON p."contentItemId" = t.id`,
      where: Prisma.sql`${Prisma.raw(`p."${config.field}"`)} = ${id} AND ${publishedScope}`,
    });
    const rows = await this.prisma.contentPlacement.findMany({
      where: {
        [config.field]: id,
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
    const parentAccess = this.access(
      grants,
      course.id,
      chapter?.id,
      config.accesses(parent),
      config.pricing(parent),
    );
    const parentType = resource.slice(0, -1) as CompletionContainerType;
    const completions = await this.completion.containers(studentUserId, [
      { id: parent.id, type: parentType },
    ]);
    const completedItems = new Set(
      (await this.prisma.studentContentProgress.findMany({
        where: { studentUserId, contentItemId: { in: rows.map((row) => row.contentItemId) } },
        select: { contentItemId: true },
      })).map((row) => row.contentItemId),
    );
    const render = (placement: any) =>
      this.withAccess(
        {
          ...this.contentItem(placement.contentItem, placement.sortOrder),
          isCompleted: completedItems.has(placement.contentItemId),
        },
        this.access(
          grants,
          course.id,
          chapter?.id,
          [placement.contentItem.accessType, ...config.accesses(parent)],
          config.pricing(parent),
        ),
      );
    return {
      parent: this.withCompletion(this.withAccess(this.node(parent), parentAccess), parentType, completions),
      ...this.placementPage(rows, query.limit, render, query.q),
    };
  }

  async library(studentUserId: string, query: SearchPaginationQueryDto) {
    // Rejects a query that normalizes to nothing (e.g. "!!!") instead of
    // matching everything, matching subjects() and the catalogue endpoints.
    searchNeedle(query.q);
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
    const completions = await this.completion.containers(studentUserId, records.flatMap((record) => {
      const course = record.course ?? record.chapter?.course;
      return [
        ...(course ? [{ id: course.id, type: 'course' as const }] : []),
        ...(record.chapter ? [{ id: record.chapter.id, type: 'chapter' as const }] : []),
      ];
    }));
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
        ? this.withCompletion(this.node(record.course), 'course', completions)
        : {
            ...this.withCompletion(this.node(record.chapter!), 'chapter', completions),
            courseId: course.id,
          };
      return [
        {
          entitlementId: record.id,
          targetType: record.courseId ? 'COURSE' : 'CHAPTER',
          target,
          course: this.withCompletion(this.node(course), 'course', completions),
          subject: this.node(course.subject),
          academicGrade: this.gradeDto(grade),
          startsAt: record.startsAt,
          expiresAt: record.expiresAt,
        },
      ];
    });
    const combined = [...data, ...(await this.archivedLibrary(studentUserId))]
      .filter((item) => this.libraryMatches(item, query.q));
    return {
      data: combined.slice((query.page - 1) * query.limit, query.page * query.limit),
      meta: toPaginationMeta(query.page, query.limit, combined.length),
    };
  }

  private async archivedLibrary(studentUserId: string) {
    const snapshots = await (
      this.prisma as any
    ).archivedAccessSnapshot.findMany({
      where: { studentUserId, revokedAt: null },
      orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
    });
    // One query per resource type rather than one (deeply nested) query per
    // snapshot: a student with a dozen archived grants was issuing a dozen
    // sequential round-trips, each joining up to four levels of ancestry.
    const byType = new Map<string, string[]>();
    for (const snapshot of snapshots) {
      const ids = byType.get(snapshot.resourceType) ?? [];
      ids.push(snapshot.resourceId);
      byType.set(snapshot.resourceType, ids);
    }
    const records = new Map<string, any>();
    await Promise.all(
      [...byType].map(async ([type, ids]) => {
        for (const record of await this.archivedRecords(type, ids)) {
          records.set(`${type}:${record.id}`, record);
        }
      }),
    );

    const rows: any[] = [];
    for (const snapshot of snapshots) {
      const record = records.get(`${snapshot.resourceType}:${snapshot.resourceId}`);
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

  /** Loads archived ancestry for many snapshots of one resource type at once. */
  private async archivedRecords(type: string, ids: string[]): Promise<any[]> {
    const where = { id: { in: ids } };
    if (type === 'ACADEMIC_GRADE')
      return this.prisma.academicGrade.findMany({ where });
    if (type === 'SUBJECT')
      return this.prisma.subject.findMany({
        where,
        include: { academicGrade: true },
      });
    if (type === 'COURSE')
      return this.prisma.course.findMany({
        where,
        include: { subject: { include: { academicGrade: true } } },
      });
    if (type === 'CHAPTER')
      return this.prisma.chapter.findMany({
        where,
        include: {
          course: {
            include: { subject: { include: { academicGrade: true } } },
          },
        },
      });
    if (type === 'LESSON')
      return this.prisma.lesson.findMany({
        where,
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
      return this.prisma.section.findMany({
        where,
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
    return [];
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
          course: { select: { id: true, title: true } },
          chapter: { select: { title: true, courseId: true } },
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
    const progress = await Promise.all(
      data.map((record) => this.completion.progress(studentUserId, {
        type: record.courseId ? 'course' : 'chapter',
        id: record.courseId ?? record.chapterId!,
      })),
    );
    return {
      data: data.map((record, index) => ({
        ...record,
        courseId: record.courseId ?? record.chapter?.courseId ?? null,
        targetType: record.courseId ? 'COURSE' : 'CHAPTER',
        targetId: record.courseId ?? record.chapterId,
        targetName: record.course?.title ?? record.chapter?.title ?? null,
        progress: progress[index],
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  private cursor(cursor?: string, q?: string) {
    if (!cursor) return undefined;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (!Number.isInteger(value.sortOrder) || typeof value.id !== 'string' || (value.q ?? '') !== normalizeArabic(q ?? ''))
        throw new Error();
      return value as { sortOrder: number; id: string };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private nodeMatches(node: any, q?: string) {
    return nodeMatches(node, q);
  }

  private libraryMatches(item: any, q?: string) {
    if (!q) return true;
    return [item.target, item.course, item.subject, item.academicGrade]
      .filter(Boolean)
      .some((node) => this.nodeMatches(node, q));
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
                JSON.stringify({ sortOrder: last.sortOrder, id: last.id, q: normalizeArabic(q ?? '') }),
              ).toString('base64url')
            : null,
      },
    };
  }
  private placementPage(
    items: any[],
    limit: number,
    render: (placement: any) => any,
    q?: string,
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
                JSON.stringify({ sortOrder: last.sortOrder, id: last.id, q: normalizeArabic(q ?? '') }),
              ).toString('base64url')
            : null,
      },
    };
  }

  private async gradeFor(studentUserId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
      include: {
        academicGrade: {
          include: {
            coverAsset: { select: { filename: true } },
            _count: { select: { subjects: { where: { status: published } } } },
          },
        },
      },
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
      select: {
        id: true,
        courseId: true,
        chapterId: true,
        expiresAt: true,
        course: { select: { title: true } },
        chapter: { select: { title: true } },
      },
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

  private searchCursor(cursor?: string, q?: string) {
    if (!cursor) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        !Array.isArray(value.key) ||
        value.key.length !== 6 ||
        !value.key.slice(0, 5).every(Number.isInteger) ||
        typeof value.key[5] !== 'string' ||
        value.q !== normalizeArabic(q ?? '')
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
      coverAssetName: record.coverAsset?.filename ?? null,
      ...(record._count
        ? { hasChildren: (Object.values(record._count)[0] as number) > 0 }
        : {}),
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
      coverAssetName: grade.coverAsset?.filename ?? null,
      ...(grade._count ? { hasChildren: grade._count.subjects > 0 } : {}),
    };
  }
  private contentItem(item: any, sortOrder: number) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      estimatedDuration: item.estimatedDuration,
      accessType: item.accessType,
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
  private withCompletion(
    node: Record<string, unknown>,
    type: CompletionContainerType,
    completions: Map<string, boolean>,
  ) {
    return { ...node, isCompleted: completions.get(`${type}:${node.id}`) ?? false };
  }
}
