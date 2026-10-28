import type { Prisma } from '@prisma/client';
import {
  ContentStatus,
  EntitlementStatus,
} from '../../common/types/roles.enum';

/**
 * Student-visible hierarchy is the student's academic grade, widened by any
 * active entitlement. A purchased or admin-granted course/chapter stays
 * reachable after the student changes grade or when it was granted outside
 * the grade; open (PUBLIC/FREE) content outside the grade stays hidden.
 */

export function activeEntitlementWhere(
  studentUserId: string,
  now = new Date(),
): Prisma.StudentEntitlementWhereInput {
  return {
    studentUserId,
    status: EntitlementStatus.ACTIVE,
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export function subjectInGradeWhere(gradeId: string): Prisma.SubjectWhereInput {
  return {
    gradeAssignments: {
      some: {
        academicGradeId: gradeId,
        academicGrade: { status: ContentStatus.PUBLISHED },
      },
    },
  };
}

/** In grade, entitled to the course, or entitled to one of its chapters. */
export function studentCourseScope(
  studentUserId: string,
  gradeId: string,
): Prisma.CourseWhereInput {
  const grant = activeEntitlementWhere(studentUserId);
  return {
    OR: [
      { subject: subjectInGradeWhere(gradeId) },
      { entitlements: { some: grant } },
      { chapters: { some: { entitlements: { some: grant } } } },
    ],
  };
}

/** In grade, entitled to the parent course, or entitled to the chapter. */
export function studentChapterScope(
  studentUserId: string,
  gradeId: string,
): Prisma.ChapterWhereInput {
  const grant = activeEntitlementWhere(studentUserId);
  return {
    OR: [
      { course: { subject: subjectInGradeWhere(gradeId) } },
      { course: { entitlements: { some: grant } } },
      { entitlements: { some: grant } },
    ],
  };
}

/** Subject include that loads what `subjectInGrade` reads. */
export const gradeAssignmentsInclude = {
  gradeAssignments: {
    include: { academicGrade: { select: { status: true } } },
  },
} as const;

/** Whether a loaded subject (with gradeAssignments + academicGrade) is in grade. */
export function subjectInGrade(
  subject: {
    gradeAssignments?: {
      academicGradeId: string;
      academicGrade?: { status: string } | null;
    }[];
  },
  gradeId: string | null | undefined,
): boolean {
  return Boolean(
    gradeId &&
    subject.gradeAssignments?.some(
      (assignment) =>
        assignment.academicGradeId === gradeId &&
        (!assignment.academicGrade ||
          assignment.academicGrade.status === ContentStatus.PUBLISHED),
    ),
  );
}
