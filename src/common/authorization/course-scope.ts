import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import type { RequestUser } from '../types/request-with-user.types';
import { assertContentStaff } from './admin-authorization';

export function assertCourseReader(actor: RequestUser) {
  if (actor.role !== Role.TEACHER) assertContentStaff(actor);
}

export async function accountScope(
  db: PrismaService,
  user: { id: string; role: Role },
) {
  if (user.role !== Role.TEACHER) return null;
  const assignments = await db.teacherCourseAssignment.findMany({
    where: { teacherId: user.id },
    orderBy: { courseId: 'asc' },
    select: { courseId: true },
  });
  return {
    type: 'COURSES' as const,
    courseIds: assignments.map((a) => a.courseId),
  };
}

export type CourseResource =
  | 'academicGrade'
  | 'subject'
  | 'course'
  | 'chapter'
  | 'lesson'
  | 'section'
  | 'contentItem';

// Relation predicates read current assignments in the database, never JWT claims.
export function courseWhere(actor: RequestUser): Prisma.CourseWhereInput {
  return actor.role === Role.TEACHER
    ? { teacherAssignments: { some: { teacherId: actor.id } } }
    : {};
}
export function resourceWhere(
  actor: RequestUser,
  resource: CourseResource,
): any {
  if (actor.role !== Role.TEACHER) return {};
  const course = courseWhere(actor);
  switch (resource) {
    case 'course':
      return course;
    case 'subject':
      return { courses: { some: course } };
    case 'academicGrade':
      return {
        subjectAssignments: {
          some: { subject: { courses: { some: course } } },
        },
      };
    case 'chapter':
      return { course };
    case 'lesson':
      return { chapter: { course } };
    case 'section':
      return { lesson: { chapter: { course } } };
    case 'contentItem':
      return {
        type: 'VIDEO',
        placement: {
          is: {
            OR: [
              { course },
              { chapter: { course } },
              { lesson: { chapter: { course } } },
              { section: { lesson: { chapter: { course } } } },
            ],
          },
        },
      };
  }
}
export function resourceSql(
  actor: RequestUser,
  resource: CourseResource,
): Prisma.Sql {
  if (actor.role !== Role.TEACHER) return Prisma.sql`TRUE`;
  const courses = Prisma.sql`SELECT c.id FROM "Course" c JOIN "TeacherCourseAssignment" a ON a."courseId" = c.id WHERE a."teacherId" = ${actor.id}`;
  switch (resource) {
    case 'course':
      return Prisma.sql`t.id IN (${courses})`;
    case 'subject':
      return Prisma.sql`t.id IN (SELECT c."subjectId" FROM "Course" c WHERE c.id IN (${courses}))`;
    case 'academicGrade':
      return Prisma.sql`t.id IN (SELECT sg."academicGradeId" FROM "SubjectGrade" sg JOIN "Course" c ON c."subjectId" = sg."subjectId" WHERE c.id IN (${courses}))`;
    case 'chapter':
      return Prisma.sql`t."courseId" IN (${courses})`;
    case 'lesson':
      return Prisma.sql`t."chapterId" IN (SELECT ch.id FROM "Chapter" ch WHERE ch."courseId" IN (${courses}))`;
    case 'section':
      return Prisma.sql`t."lessonId" IN (SELECT l.id FROM "Lesson" l JOIN "Chapter" ch ON ch.id = l."chapterId" WHERE ch."courseId" IN (${courses}))`;
    case 'contentItem':
      return Prisma.sql`t.type = 'VIDEO' AND t.id IN (SELECT p."contentItemId" FROM "ContentPlacement" p WHERE p."resolvedCourseId" IN (${courses}))`;
  }
}
export async function assertResource(
  db: PrismaService,
  actor: RequestUser,
  resource: CourseResource,
  id: string,
) {
  assertCourseReader(actor);
  if (actor.role !== Role.TEACHER) return;
  const delegate = db[resource] as any;
  if (
    !(await delegate.findFirst({
      where: { AND: [{ id }, resourceWhere(actor, resource)] },
      select: { id: true },
    }))
  )
    throw new NotFoundException('Resource not found');
}
export async function assertTeacherVideo(
  db: PrismaService,
  actor: RequestUser,
  assetId: string,
  upload = false,
) {
  assertCourseReader(actor);
  if (actor.role !== Role.TEACHER) return;
  const asset = await db.asset.findFirst({
    where: {
      id: assetId,
      kind: 'VIDEO',
      deletionStartedAt: null,
      OR: [
        { primaryFor: { some: resourceWhere(actor, 'contentItem') } },
        {
          primaryFor: { none: {} },
          uploadedById: actor.id,
          uploadContentItem: {
            ...resourceWhere(actor, 'contentItem'),
            status: 'DRAFT',
            primaryAssetId: null,
          },
        },
      ],
    },
    include: { uploadContentItem: true, primaryFor: { select: { id: true } } },
  });
  if (!asset) throw new NotFoundException('Video asset not found');
  if (
    upload &&
    (asset.uploadedById !== actor.id ||
      asset.uploadContentItem?.status !== 'DRAFT' ||
      asset.primaryFor.length > 0)
  )
    throw new ForbiddenException(
      'Teachers can upload only their scoped unattached draft videos',
    );
}
