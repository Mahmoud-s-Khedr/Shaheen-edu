import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AccessType, ContentStatus } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import type { CursorAccessibleCatalogResponseDto } from '../src/modules/catalog/dto/student-catalog-response.dto';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';

describe('Accessible student catalog (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let studentId: string;
  let token: string;
  let adminToken: string;
  let ownerId: string;
  let subjectId: string;
  let gradeId: string;
  let otherGradeId: string;
  let governorateId: string;
  type Path = {
    courseId: string;
    chapterId: string;
    lessonId: string;
    sectionId: string;
  };
  const paths: Record<string, Path> = {};
  const json = <T = CursorAccessibleCatalogResponseDto>(response: {
    body: string;
  }): T => JSON.parse(response.body) as T;
  const read = (resource: string, query = '', accessToken = token) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/student/catalog/${resource}${query ? `?${query}` : ''}`,
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);
    await flushTestRedis(app);
    const owner = await seedSuperAdmin(
      app,
      'accessible-admin@example.com',
      'SuperAdminP@ss1!',
    );
    ownerId = owner.id;
    adminToken = json<{ accessToken: string }>(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/admins/login',
        payload: { email: owner.loginIdentifier, password: 'SuperAdminP@ss1!' },
      }),
    ).accessToken;
    gradeId = (await seedPublishedAcademicGrade(app, 'accessible-grade')).id;
    otherGradeId = (
      await seedPublishedAcademicGrade(app, 'accessible-other-grade')
    ).id;
    const governorate = await seedGovernorate(app, 'Cairo');
    governorateId = governorate.id;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        fullName: 'Accessible Student',
        nationalId: '29903030312345',
        phone: '01099990001',
        parentPhone: '01088880001',
        governorateId: governorate.id,
        academicGradeId: gradeId,
        password: 'StudentP@ss1!',
      },
    });
    expect(registration.statusCode).toBe(201);
    const registered = json<{ user: { id: string }; accessToken: string }>(
      registration,
    );
    studentId = registered.user.id;
    token = registered.accessToken;
    const audit = { createdById: ownerId, updatedById: ownerId };
    const subject = await prisma.subject.create({
      data: {
        ...audit,
        title: 'Accessible subject',
        slug: 'accessible-subject',
        sortOrder: 1,
        status: 'PUBLISHED',
        gradeAssignments: {
          create: { academicGradeId: gradeId, sortOrder: 1 },
        },
      },
    });
    subjectId = subject.id;
    const otherSubject = await prisma.subject.create({
      data: {
        ...audit,
        title: 'Other subject',
        slug: 'other-subject',
        sortOrder: 2,
        status: 'PUBLISHED',
        gradeAssignments: {
          create: { academicGradeId: otherGradeId, sortOrder: 1 },
        },
      },
    });

    const createPath = async (
      name: string,
      accessType: AccessType,
      index: number,
      targetSubjectId = subjectId,
    ) => {
      const course = await prisma.course.create({
        data: {
          ...audit,
          subjectId: targetSubjectId,
          title: name,
          slug: name,
          sortOrder: index,
          status: 'PUBLISHED',
          accessType,
        },
      });
      const chapter = await prisma.chapter.create({
        data: {
          ...audit,
          courseId: course.id,
          title: name,
          slug: name,
          sortOrder: 1,
          status: 'PUBLISHED',
        },
      });
      const lesson = await prisma.lesson.create({
        data: {
          ...audit,
          chapterId: chapter.id,
          title: `إسلام ${name}`,
          slug: name,
          sortOrder: 200,
          status: 'PUBLISHED',
        },
      });
      const section = await prisma.section.create({
        data: {
          ...audit,
          lessonId: lesson.id,
          title: `إسلام ${name}`,
          slug: name,
          sortOrder: 200,
          status: 'PUBLISHED',
        },
      });
      paths[name] = {
        courseId: course.id,
        chapterId: chapter.id,
        lessonId: lesson.id,
        sectionId: section.id,
      };
    };
    await createPath('public', 'PUBLIC', 1);
    await createPath('free', 'FREE', 2);
    await createPath('course-grant', 'PAID', 3);
    await createPath('chapter-grant', 'PAID', 4);
    await createPath('locked', 'PAID', 5);
    await createPath('expired', 'PAID', 6);
    await createPath('revoked', 'PAID', 7);
    await createPath('future', 'PAID', 8);
    await createPath('inactive', 'PAID', 9);
    await createPath('other-grade', 'PUBLIC', 1, otherSubject.id);
    await prisma.course.update({
      where: { id: paths.locked.courseId },
      data: { isPurchasable: true, priceMinor: 1000, currency: 'EGP' },
    });
    const siblingChapter = await prisma.chapter.create({
      data: {
        ...audit,
        courseId: paths['chapter-grant'].courseId,
        title: 'Ungranted sibling',
        slug: 'ungranted-sibling',
        sortOrder: 2,
        status: 'PUBLISHED',
      },
    });
    const siblingLesson = await prisma.lesson.create({
      data: {
        ...audit,
        chapterId: siblingChapter.id,
        title: 'Ungranted sibling',
        slug: 'ungranted-sibling',
        sortOrder: 1,
        status: 'PUBLISHED',
      },
    });
    await prisma.section.create({
      data: {
        ...audit,
        lessonId: siblingLesson.id,
        title: 'Ungranted sibling',
        slug: 'ungranted-sibling',
        sortOrder: 1,
        status: 'PUBLISHED',
      },
    });
    await prisma.studentEntitlement.createMany({
      data: [
        {
          studentUserId: studentId,
          courseId: paths['course-grant'].courseId,
          grantedById: ownerId,
        },
        {
          studentUserId: studentId,
          chapterId: paths['chapter-grant'].chapterId,
          grantedById: ownerId,
        },
        {
          studentUserId: studentId,
          courseId: paths.expired.courseId,
          grantedById: ownerId,
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          studentUserId: studentId,
          courseId: paths.revoked.courseId,
          grantedById: ownerId,
          revokedAt: new Date(),
        },
        {
          studentUserId: studentId,
          courseId: paths.future.courseId,
          grantedById: ownerId,
          startsAt: new Date(Date.now() + 60_000),
        },
        {
          studentUserId: studentId,
          courseId: paths.inactive.courseId,
          grantedById: ownerId,
          status: 'REVOKED',
        },
      ],
    });
    // More than one scan batch of inaccessible entries must not hide matches.
    await prisma.lesson.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        ...audit,
        chapterId: paths.locked.chapterId,
        title: `Locked ${index}`,
        slug: `locked-${index}`,
        sortOrder: index,
        status: 'PUBLISHED' as const,
      })),
    });
    await prisma.section.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        ...audit,
        lessonId: paths.locked.lessonId,
        title: `Locked ${index}`,
        slug: `locked-${index}`,
        sortOrder: index,
        status: 'PUBLISHED' as const,
      })),
    });
    const item = await prisma.contentItem.create({
      data: {
        ...audit,
        type: 'TEXT',
        title: 'Completed public item',
        textBody: 'Done',
        status: 'PUBLISHED',
        placement: {
          create: {
            sectionId: paths.public.sectionId,
            subjectId,
            resolvedCourseId: paths.public.courseId,
            resolvedChapterId: paths.public.chapterId,
            resolvedLessonId: paths.public.lessonId,
            resolvedSectionId: paths.public.sectionId,
            sortOrder: 1,
          },
        },
      },
    });
    await prisma.studentContentProgress.create({
      data: {
        studentUserId: studentId,
        contentItemId: item.id,
        completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(['lessons', 'sections'])('%s', (resource) => {
    const idKey = resource === 'lessons' ? 'lessonId' : 'sectionId';
    it('requires student authentication', async () => {
      expect((await read(resource, '', '')).statusCode).toBe(401);
      expect((await read(resource, '', adminToken)).statusCode).toBe(403);
    });

    it('returns exactly accessible nodes with breadcrumbs and completion', async () => {
      const response = await read(resource);
      expect(response.statusCode).toBe(200);
      const body = json(response);
      expect(body.data.map((row: { id: string }) => row.id).sort()).toEqual(
        ['public', 'free', 'course-grant', 'chapter-grant']
          .map((key) => paths[key][idKey])
          .sort(),
      );
      expect(body).not.toHaveProperty('parent');
      expect(body.pageInfo).toEqual({ hasNextPage: false, nextCursor: null });
      expect(
        body.data.find((row: { id: string }) => row.id === paths.public[idKey]),
      ).toMatchObject({
        access: { state: 'PUBLIC' },
        isLocked: false,
        isCompleted: true,
        breadcrumb: {
          subject: { id: subjectId },
          course: { id: paths.public.courseId },
          chapter: { id: paths.public.chapterId },
          ...(resource === 'sections'
            ? { lesson: { id: paths.public.lessonId } }
            : {}),
        },
      });
    });

    it('combines hierarchy, access, completion and Arabic search filters', async () => {
      const query = new URLSearchParams({
        subjectId,
        chapterIds: ` ${paths.public.chapterId},${paths.free.chapterId},${paths.public.chapterId} `,
        q: 'اسلام',
        isCompleted: 'true',
        accessState: 'PUBLIC',
      });
      const response = await read(resource, query.toString());
      expect(response.statusCode).toBe(200);
      expect(json(response).data.map((row: { id: string }) => row.id)).toEqual([
        paths.public[idKey],
      ]);
      const byCourse = await read(
        resource,
        `courseId=${paths.free.courseId}&isCompleted=false&accessState=FREE`,
      );
      expect(json(byCourse).data.map((row: { id: string }) => row.id)).toEqual([
        paths.free[idKey],
      ]);
      const entitled = await read(resource, 'accessState=ENTITLED');
      expect(
        json(entitled)
          .data.map((row: { id: string }) => row.id)
          .sort(),
      ).toEqual(
        [paths['course-grant'][idKey], paths['chapter-grant'][idKey]].sort(),
      );
      expect(json(await read(resource, 'q=unmatched')).data).toEqual([]);
      expect(
        json(
          await read(
            resource,
            `courseId=${paths.free.courseId}&chapterIds=${paths.public.chapterId}`,
          ),
        ).data,
      ).toEqual([]);
      expect(json(await read(resource, 'chapterIds=unknown')).data).toEqual([]);
    });

    it('paginates tied sort orders and filtered candidates without gaps', async () => {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const response = await read(
          resource,
          `limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        expect(response.statusCode).toBe(200);
        const body = json(response);
        expect(body.data).toHaveLength(1);
        ids.push(body.data[0].id);
        cursor = body.pageInfo.nextCursor;
        expect(ids.length).toBeLessThanOrEqual(4);
      } while (cursor);
      expect(new Set(ids).size).toBe(4);
      const completed = json(await read(resource, 'limit=1&isCompleted=true'));
      expect(completed.data.map((row: { id: string }) => row.id)).toEqual([
        paths.public[idKey],
      ]);
      expect(completed.pageInfo.hasNextPage).toBe(false);
      const incomplete = json(
        await read(resource, 'limit=1&isCompleted=false'),
      );
      expect(incomplete.data[0].id).not.toBe(paths.public[idKey]);
      expect(incomplete.pageInfo.hasNextPage).toBe(true);
    });

    it('binds cursors to the endpoint and filters but allows limit changes', async () => {
      const first = json(await read(resource, 'limit=1'));
      const cursor = encodeURIComponent(first.pageInfo.nextCursor as string);
      expect(
        (await read(resource, `cursor=${cursor}&limit=2`)).statusCode,
      ).toBe(200);
      expect(
        (await read(resource, `cursor=${cursor}&isCompleted=false`)).statusCode,
      ).toBe(400);
      expect(
        (
          await read(
            resource === 'lessons' ? 'sections' : 'lessons',
            `cursor=${cursor}`,
          )
        ).statusCode,
      ).toBe(400);
      const chapters = [paths.public.chapterId, paths.free.chapterId];
      const filtered = json(
        await read(resource, `limit=1&chapterIds=${chapters.join(',')}`),
      );
      expect(
        (
          await read(
            resource,
            `chapterIds=${chapters.reverse().join(',')}&cursor=${encodeURIComponent(filtered.pageInfo.nextCursor as string)}`,
          )
        ).statusCode,
      ).toBe(200);
    });

    it('filters completion before hydrating a page of candidates', async () => {
      const audit = { createdById: ownerId, updatedById: ownerId };
      const rows = Array.from({ length: 105 }, (_, sortOrder) => ({
        ...audit,
        title: `Incomplete ${sortOrder}`,
        slug: `incomplete-${sortOrder}`,
        sortOrder,
        status: 'PUBLISHED' as const,
      }));
      if (resource === 'lessons') {
        await prisma.lesson.createMany({
          data: rows.map((row) => ({
            ...row,
            chapterId: paths.public.chapterId,
          })),
        });
      } else {
        await prisma.section.createMany({
          data: rows.map((row) => ({
            ...row,
            lessonId: paths.public.lessonId,
          })),
        });
      }
      const lessonsRead = jest.spyOn(prisma.lesson, 'findMany');
      const sectionsRead = jest.spyOn(prisma.section, 'findMany');
      try {
        const response = await read(
          resource,
          `courseId=${paths.public.courseId}&isCompleted=true&limit=1`,
        );
        expect(response.statusCode).toBe(200);
        expect(json(response).data.map((row) => row.id)).toEqual([
          paths.public[idKey],
        ]);
        expect(json(response).pageInfo).toEqual({
          hasNextPage: false,
          nextCursor: null,
        });
        const hydration = resource === 'lessons' ? lessonsRead : sectionsRead;
        expect(hydration).toHaveBeenCalledTimes(1);
        expect(hydration.mock.calls[0][0]?.where?.id).toEqual({
          in: [paths.public[idKey]],
        });
      } finally {
        lessonsRead.mockRestore();
        sectionsRead.mockRestore();
        if (resource === 'lessons') {
          await prisma.lesson.deleteMany({
            where: {
              chapterId: paths.public.chapterId,
              slug: { startsWith: 'incomplete-' },
            },
          });
        } else {
          await prisma.section.deleteMany({
            where: {
              lessonId: paths.public.lessonId,
              slug: { startsWith: 'incomplete-' },
            },
          });
        }
      }
    });

    it('does not hydrate candidates rejected by the access filter', async () => {
      const lessonsRead = jest.spyOn(prisma.lesson, 'findMany');
      const sectionsRead = jest.spyOn(prisma.section, 'findMany');
      try {
        const response = await read(
          resource,
          `courseId=${paths.locked.courseId}&accessState=ENTITLED&limit=1`,
        );
        expect(response.statusCode).toBe(200);
        expect(json(response).data).toEqual([]);
        expect(lessonsRead).not.toHaveBeenCalled();
        expect(sectionsRead).not.toHaveBeenCalled();
      } finally {
        lessonsRead.mockRestore();
        sectionsRead.mockRestore();
      }
    });

    it.each(['unpublish', 'change-grade'] as const)(
      'rechecks scope during hydration after concurrent %s',
      async (change) => {
        const original = prisma.$queryRaw.bind(prisma);
        let changed = false;
        const selection = jest
          .spyOn(prisma, '$queryRaw')
          // This await-only test double does not need Prisma's lazy transaction API.
          .mockImplementation((async (
            query: Parameters<typeof prisma.$queryRaw>[0],
          ) => {
            const result = await original(query);
            if (!changed) {
              changed = true;
              if (change === 'unpublish') {
                await prisma.chapter.update({
                  where: { id: paths.public.chapterId },
                  data: { status: 'DRAFT' },
                });
              } else {
                await prisma.subjectGrade.delete({
                  where: {
                    academicGradeId_subjectId: {
                      subjectId,
                      academicGradeId: gradeId,
                    },
                  },
                });
              }
            }
            return result;
          }) as typeof prisma.$queryRaw);
        try {
          const response = await read(
            resource,
            `courseId=${paths.public.courseId}`,
          );
          expect(changed).toBe(true);
          expect(response.statusCode).toBe(200);
          expect(json(response).data).toEqual([]);
        } finally {
          selection.mockRestore();
          if (change === 'unpublish') {
            await prisma.chapter.update({
              where: { id: paths.public.chapterId },
              data: { status: 'PUBLISHED' },
            });
          } else if (changed) {
            await prisma.subjectGrade.create({
              data: { subjectId, academicGradeId: gradeId, sortOrder: 1 },
            });
          }
        }
      },
    );

    it.each([
      'chapterIds=',
      'chapterIds=a,,b',
      'accessState=LOCKED',
      'isCompleted=1',
      'limit=101',
      'q=',
      'cursor=invalid',
    ])('rejects invalid query %s', async (query) => {
      expect((await read(resource, query)).statusCode).toBe(400);
    });

    it.each(['DRAFT', 'ARCHIVED'] as ContentStatus[])(
      'excludes %s nodes and ancestors',
      async (status) => {
        const path = paths.public;
        for (const [model, id] of [
          [prisma.subject, subjectId],
          [prisma.course, path.courseId],
          [prisma.chapter, path.chapterId],
          [prisma.lesson, path.lessonId],
          ...(resource === 'sections'
            ? [[prisma.section, path.sectionId] as const]
            : []),
        ] as const) {
          // Delegates have different generated overloads; update each via its concrete delegate.
          const update = async (nextStatus: ContentStatus) => {
            const data = { status: nextStatus };
            if (model === prisma.subject)
              await prisma.subject.update({ where: { id }, data });
            else if (model === prisma.course)
              await prisma.course.update({ where: { id }, data });
            else if (model === prisma.chapter)
              await prisma.chapter.update({ where: { id }, data });
            else if (model === prisma.lesson)
              await prisma.lesson.update({ where: { id }, data });
            else await prisma.section.update({ where: { id }, data });
          };
          await update(status);
          try {
            const response = await read(resource, `courseId=${path.courseId}`);
            expect(response.statusCode).toBe(200);
            expect(json(response).data).toEqual([]);
          } finally {
            await update('PUBLISHED');
          }
        }
      },
    );
  });

  it('supports multiple lessonIds on sections and rejects lessonIds on lessons', async () => {
    const ids = [paths.public.lessonId, paths.free.lessonId];
    const response = await read(
      'sections',
      `lessonIds=${ids.join(',')}&chapterIds=${paths.public.chapterId}`,
    );
    expect(response.statusCode).toBe(200);
    expect(json(response).data.map((row: { id: string }) => row.id)).toEqual([
      paths.public.sectionId,
    ]);
    expect((await read('sections', 'lessonIds=a,,b')).statusCode).toBe(400);
    expect(
      (await read('lessons', `lessonIds=${ids.join(',')}`)).statusCode,
    ).toBe(400);
  });

  it('resolves explicit free/public overrides within paid ancestry', async () => {
    await prisma.lesson.update({
      where: { id: paths.locked.lessonId },
      data: { accessType: 'FREE' },
    });
    try {
      const lessons = await read(
        'lessons',
        `courseId=${paths.locked.courseId}`,
      );
      expect(json(lessons).data.map((row: { id: string }) => row.id)).toEqual([
        paths.locked.lessonId,
      ]);
      await prisma.section.update({
        where: { id: paths.locked.sectionId },
        data: { accessType: 'PUBLIC' },
      });
      const sections = await read(
        'sections',
        `courseId=${paths.locked.courseId}&accessState=PUBLIC`,
      );
      expect(json(sections).data.map((row: { id: string }) => row.id)).toEqual([
        paths.locked.sectionId,
      ]);
    } finally {
      await prisma.lesson.update({
        where: { id: paths.locked.lessonId },
        data: { accessType: 'INHERIT' },
      });
      await prisma.section.update({
        where: { id: paths.locked.sectionId },
        data: { accessType: 'INHERIT' },
      });
    }
  });
  it('keeps entitled courses and chapters reachable outside the student grade', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        fullName: 'Other Grade Student',
        nationalId: '29903030322345',
        phone: '01099990002',
        parentPhone: '01088880002',
        governorateId,
        academicGradeId: otherGradeId,
        password: 'StudentP@ss1!',
      },
    });
    expect(registration.statusCode).toBe(201);
    const outsider = json<{ user: { id: string }; accessToken: string }>(
      registration,
    );
    await prisma.studentEntitlement.createMany({
      data: [
        {
          studentUserId: outsider.user.id,
          courseId: paths['course-grant'].courseId,
          grantedById: ownerId,
        },
        {
          studentUserId: outsider.user.id,
          chapterId: paths['chapter-grant'].chapterId,
          grantedById: ownerId,
        },
      ],
    });
    const item = await prisma.contentItem.create({
      data: {
        createdById: ownerId,
        updatedById: ownerId,
        type: 'TEXT',
        title: 'Granted paid item',
        textBody: 'Paid body',
        status: 'PUBLISHED',
        placement: {
          create: {
            lessonId: paths['course-grant'].lessonId,
            subjectId,
            resolvedCourseId: paths['course-grant'].courseId,
            resolvedChapterId: paths['course-grant'].chapterId,
            resolvedLessonId: paths['course-grant'].lessonId,
            sortOrder: 1,
          },
        },
      },
    });
    const as = (resource: string, query = '') =>
      read(resource, query, outsider.accessToken);
    const ids = (response: { body: string }) =>
      json<{ data: { id: string }[] }>(response).data.map((row) => row.id);

    const course = await as(`courses/${paths['course-grant'].courseId}`);
    expect(course.statusCode).toBe(200);
    expect(json(course)).toMatchObject({ access: { state: 'ENTITLED' } });
    const chapters = await as(
      `courses/${paths['course-grant'].courseId}/chapters`,
    );
    expect(chapters.statusCode).toBe(200);
    expect(ids(chapters)).toEqual([paths['course-grant'].chapterId]);
    expect(
      (await as(`chapters/${paths['course-grant'].chapterId}/lessons`))
        .statusCode,
    ).toBe(200);
    expect(
      (await as(`lessons/${paths['course-grant'].lessonId}/sections`))
        .statusCode,
    ).toBe(200);
    expect(
      (await as(`lessons/${paths['course-grant'].lessonId}/content-items`))
        .statusCode,
    ).toBe(200);
    const delivery = await app.inject({
      method: 'GET',
      url: `/api/v1/student/content-items/${item.id}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(delivery.statusCode).toBe(200);
    expect(json<{ textBody: string }>(delivery).textBody).toBe('Paid body');

    // A chapter grant exposes only that chapter of an out-of-grade course.
    const grantedChapters = await as(
      `courses/${paths['chapter-grant'].courseId}/chapters`,
    );
    expect(grantedChapters.statusCode).toBe(200);
    expect(ids(grantedChapters)).toEqual([paths['chapter-grant'].chapterId]);

    // Open (PUBLIC/FREE) and ungranted content outside the grade stays hidden.
    for (const name of ['public', 'free', 'locked'])
      expect(
        (await as(`courses/${paths[name].courseId}/chapters`)).statusCode,
      ).toBe(404);
    const subjectCourses = await as(`subjects/${subjectId}/courses`);
    expect(subjectCourses.statusCode).toBe(200);
    expect(ids(subjectCourses).sort()).toEqual(
      [paths['course-grant'].courseId, paths['chapter-grant'].courseId].sort(),
    );
    // Entitled lessons from the other grade, plus open content in the
    // student's own grade.
    const lessons = await as('lessons');
    expect(lessons.statusCode).toBe(200);
    expect(ids(lessons).sort()).toEqual(
      [
        paths['course-grant'].lessonId,
        paths['chapter-grant'].lessonId,
        paths['other-grade'].lessonId,
      ].sort(),
    );
  });
});
