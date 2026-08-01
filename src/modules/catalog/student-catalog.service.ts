/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Prisma's nested catalogue response is rendered through deliberately narrow learner DTOs. */
import {
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
      include: {
        subject: true,
        chapters: { where: { status: published }, orderBy: order },
      },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = await this.activeGrants(studentUserId);
    return {
      ...this.withAccess(
        this.node(course),
        this.access(grants, course.id, undefined, [course.accessType], course),
      ),
      subject: this.node(course.subject),
      chapters: course.chapters.map((chapter) =>
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
    };
  }

  async chapter(studentUserId: string, chapterId: string) {
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
        contentPlacements: this.placements(),
        lessons: {
          where: { status: published },
          orderBy: order,
          include: {
            contentPlacements: this.placements(),
            sections: {
              where: { status: published },
              orderBy: order,
              include: { contentPlacements: this.placements() },
            },
          },
        },
      },
    });
    if (!chapter) throw new NotFoundException('Published chapter not found');
    const grants = await this.activeGrants(studentUserId);
    const chapterAccess = this.access(
      grants,
      chapter.courseId,
      chapter.id,
      [chapter.accessType, chapter.course.accessType],
      this.chapterPricing(chapter, chapter.course),
    );
    const renderItem = (placement: any, accessTypes: AccessType[]) =>
      this.withAccess(
        this.contentItem(placement.contentItem, placement.sortOrder),
        this.access(
          grants,
          chapter.courseId,
          chapter.id,
          [placement.contentItem.accessType, ...accessTypes],
          this.chapterPricing(chapter, chapter.course),
        ),
      );
    const renderSection = (section: any, inherited: AccessType[]) => ({
      ...this.withAccess(
        this.node(section),
        this.access(
          grants,
          chapter.courseId,
          chapter.id,
          [section.accessType, ...inherited],
          this.chapterPricing(chapter, chapter.course),
        ),
      ),
      contentItems: section.contentPlacements.map((placement: any) =>
        renderItem(placement, [section.accessType, ...inherited]),
      ),
    });
    const renderLesson = (lesson: any) => ({
      ...this.withAccess(
        this.node(lesson),
        this.access(
          grants,
          chapter.courseId,
          chapter.id,
          [lesson.accessType, chapter.accessType, chapter.course.accessType],
          this.chapterPricing(chapter, chapter.course),
        ),
      ),
      contentItems: lesson.contentPlacements.map((placement: any) =>
        renderItem(placement, [
          lesson.accessType,
          chapter.accessType,
          chapter.course.accessType,
        ]),
      ),
      sections: lesson.sections.map((section: any) =>
        renderSection(section, [
          lesson.accessType,
          chapter.accessType,
          chapter.course.accessType,
        ]),
      ),
    });
    return {
      ...this.withAccess(this.node(chapter), chapterAccess),
      course: this.withAccess(
        this.node(chapter.course),
        this.access(
          grants,
          chapter.courseId,
          undefined,
          [chapter.course.accessType],
          chapter.course,
        ),
      ),
      contentItems: chapter.contentPlacements.map((placement: any) =>
        renderItem(placement, [chapter.accessType, chapter.course.accessType]),
      ),
      lessons: chapter.lessons.map(renderLesson),
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
    const snapshots = await (this.prisma as any).archivedAccessSnapshot.findMany({ where: { studentUserId, revokedAt: null }, orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }] });
    const rows: any[] = [];
    for (const snapshot of snapshots) {
      const record = await this.archivedRecord(snapshot.resourceType, snapshot.resourceId);
      if (!record) continue;
      const path = this.archivedPath(snapshot.resourceType, record);
      rows.push({ archivedAccessSnapshotId: snapshot.id, targetType: snapshot.resourceType, target: this.node(record), course: path.course ? this.node(path.course) : null, subject: path.subject ? this.node(path.subject) : null, academicGrade: path.grade ? this.gradeDto(path.grade) : null, retainedAccess: true, archivedAt: snapshot.archivedAt });
    }
    return rows;
  }

  private async archivedRecord(type: string, id: string): Promise<any> {
    if (type === 'ACADEMIC_GRADE') return this.prisma.academicGrade.findUnique({ where: { id } });
    if (type === 'SUBJECT') return this.prisma.subject.findUnique({ where: { id }, include: { academicGrade: true } });
    if (type === 'COURSE') return this.prisma.course.findUnique({ where: { id }, include: { subject: { include: { academicGrade: true } } } });
    if (type === 'CHAPTER') return this.prisma.chapter.findUnique({ where: { id }, include: { course: { include: { subject: { include: { academicGrade: true } } } } } });
    if (type === 'LESSON') return this.prisma.lesson.findUnique({ where: { id }, include: { chapter: { include: { course: { include: { subject: { include: { academicGrade: true } } } } } } } });
    if (type === 'SECTION') return this.prisma.section.findUnique({ where: { id }, include: { lesson: { include: { chapter: { include: { course: { include: { subject: { include: { academicGrade: true } } } } } } } } } });
    return null;
  }

  private archivedPath(type: string, record: any) {
    if (type === 'ACADEMIC_GRADE') return { grade: record, subject: null, course: null };
    if (type === 'SUBJECT') return { grade: record.academicGrade, subject: record, course: null };
    if (type === 'COURSE') return { grade: record.subject.academicGrade, subject: record.subject, course: record };
    if (type === 'CHAPTER') return { grade: record.course.subject.academicGrade, subject: record.course.subject, course: record.course };
    if (type === 'LESSON') return { grade: record.chapter.course.subject.academicGrade, subject: record.chapter.course.subject, course: record.chapter.course };
    return { grade: record.lesson.chapter.course.subject.academicGrade, subject: record.lesson.chapter.course.subject, course: record.lesson.chapter.course };
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
  private placements() {
    return {
      where: { contentItem: { status: published } },
      include: { contentItem: true },
      orderBy: order,
    };
  }
}
