import {
  studentChapterScope,
  studentCourseScope,
  subjectInGrade,
} from './student-grade-scope';

describe('student grade scope', () => {
  it('widens a course to the grade or an active course/chapter entitlement', () => {
    const scope = studentCourseScope('student-1', 'grade-a');
    expect(scope.OR).toHaveLength(3);
    expect(scope.OR?.[0]).toMatchObject({
      subject: {
        gradeAssignments: { some: { academicGradeId: 'grade-a' } },
      },
    });
    expect(scope.OR?.[1]).toMatchObject({
      entitlements: {
        some: { studentUserId: 'student-1', status: 'ACTIVE', revokedAt: null },
      },
    });
    expect(scope.OR?.[2]).toMatchObject({
      chapters: {
        some: { entitlements: { some: { studentUserId: 'student-1' } } },
      },
    });
  });

  it('widens a chapter to the grade, its course grant, or its own grant', () => {
    const scope = studentChapterScope('student-1', 'grade-a');
    expect(scope.OR).toHaveLength(3);
    expect(scope.OR?.[0]).toMatchObject({
      course: {
        subject: { gradeAssignments: { some: { academicGradeId: 'grade-a' } } },
      },
    });
    expect(scope.OR?.[1]).toMatchObject({
      course: { entitlements: { some: { studentUserId: 'student-1' } } },
    });
    expect(scope.OR?.[2]).toMatchObject({
      entitlements: { some: { studentUserId: 'student-1' } },
    });
  });

  it('matches only a published grade assignment for the student grade', () => {
    const subject = {
      gradeAssignments: [
        { academicGradeId: 'grade-a', academicGrade: { status: 'PUBLISHED' } },
        { academicGradeId: 'grade-b', academicGrade: { status: 'DRAFT' } },
      ],
    };
    expect(subjectInGrade(subject, 'grade-a')).toBe(true);
    expect(subjectInGrade(subject, 'grade-b')).toBe(false);
    expect(subjectInGrade(subject, 'grade-c')).toBe(false);
    expect(subjectInGrade(subject, null)).toBe(false);
  });
});
