import { ForbiddenException } from '@nestjs/common';
import { ContentAccessPolicyService } from './content-access-policy.service';

describe('ContentAccessPolicyService grade and entitlement rules', () => {
  const published = 'PUBLISHED';

  function item(courseAccessType: string, gradeId = 'grade-a') {
    const subject = {
      id: 'subject-1',
      status: published,
      gradeAssignments: [
        { academicGradeId: gradeId, academicGrade: { status: published } },
      ],
    };
    const course = {
      id: 'course-1',
      subjectId: subject.id,
      status: published,
      accessType: courseAccessType,
      subject,
    };
    const chapter = {
      id: 'chapter-1',
      courseId: course.id,
      status: published,
      accessType: 'INHERIT',
      course,
    };
    return {
      id: 'item-1',
      status: published,
      accessType: 'INHERIT',
      assetReferences: [],
      placement: { chapter, chapterId: chapter.id },
    };
  }

  function build(
    content: unknown,
    {
      studentGradeId = 'grade-a',
      entitlement = null,
    }: { studentGradeId?: string | null; entitlement?: unknown } = {},
  ) {
    const prisma = {
      contentItem: { findUnique: jest.fn().mockResolvedValue(content) },
      studentProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ academicGradeId: studentGradeId }),
      },
      studentEntitlement: {
        findFirst: jest.fn().mockResolvedValue(entitlement),
      },
    };
    return {
      policy: new ContentAccessPolicyService(prisma as never),
      prisma,
    };
  }

  it('serves FREE content inside the student grade without an entitlement', async () => {
    const { policy, prisma } = build(item('FREE'));
    await expect(
      policy.assertContentItemAccess('item-1', 'student-1'),
    ).resolves.toMatchObject({ id: 'item-1' });
    expect(prisma.studentEntitlement.findFirst).not.toHaveBeenCalled();
  });

  it('keeps FREE content outside the student grade closed without an entitlement', async () => {
    const { policy } = build(item('FREE'), { studentGradeId: 'grade-b' });
    await expect(
      policy.assertContentItemAccess('item-1', 'student-1'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Content is not available for this academic grade',
      ),
    );
  });

  it('serves entitled PAID content outside the student grade', async () => {
    const { policy, prisma } = build(item('PAID'), {
      studentGradeId: 'grade-b',
      entitlement: { id: 'grant-1' },
    });
    await expect(
      policy.assertContentItemAccess('item-1', 'student-1'),
    ).resolves.toMatchObject({ id: 'item-1' });
    const [[query]] = prisma.studentEntitlement.findFirst.mock.calls as [
      [unknown],
    ];
    expect(query).toMatchObject({ where: { studentUserId: 'student-1' } });
  });

  it('serves entitled content to a student without a grade', async () => {
    const { policy } = build(item('PAID'), {
      studentGradeId: null,
      entitlement: { id: 'grant-1' },
    });
    await expect(
      policy.assertContentItemAccess('item-1', 'student-1'),
    ).resolves.toMatchObject({ id: 'item-1' });
  });

  it('still requires an entitlement for PAID content inside the grade', async () => {
    const { policy } = build(item('PAID'));
    await expect(
      policy.assertContentItemAccess('item-1', 'student-1'),
    ).rejects.toThrow(
      new ForbiddenException('A valid entitlement is required'),
    );
  });

  it('keeps PUBLIC content open to anonymous callers', async () => {
    const { policy, prisma } = build(item('PUBLIC'));
    await expect(
      policy.assertContentItemAccess('item-1'),
    ).resolves.toMatchObject({ id: 'item-1' });
    expect(prisma.studentProfile.findUnique).not.toHaveBeenCalled();
  });

  describe('entitledForNodes', () => {
    const nodes = [
      {
        id: 'chapter-1',
        courseId: 'course-1',
        status: published,
        accessType: 'INHERIT',
      },
      { id: 'course-1', status: published, accessType: 'FREE' },
    ];

    it('treats FREE nodes as open inside the grade', async () => {
      const { policy, prisma } = build(null);
      await expect(policy.entitledForNodes('student-1', nodes)).resolves.toBe(
        true,
      );
      expect(prisma.studentEntitlement.findFirst).not.toHaveBeenCalled();
    });

    it('requires an entitlement for FREE nodes outside the grade', async () => {
      const { policy } = build(null);
      await expect(
        policy.entitledForNodes('student-1', nodes, { inGrade: false }),
      ).resolves.toBe(false);
    });

    it('accepts an entitlement outside the grade', async () => {
      const { policy } = build(null, { entitlement: { id: 'grant-1' } });
      await expect(
        policy.entitledForNodes('student-1', nodes, { inGrade: false }),
      ).resolves.toBe(true);
    });
  });
});
