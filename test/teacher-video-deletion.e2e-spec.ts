import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Role } from '@prisma/client';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { VideoDeletionRequestsService } from '../src/modules/video-deletion-requests/video-deletion-requests.service';

const password = 'TeacherPassword123!';
const json = (r: { body: string }) => JSON.parse(r.body);
const execution = (r: { body: string }) =>
  (JSON.parse(r.body) as { execution: string }).execution;

describe('Teacher course authorization and durable video deletion (e2e)', () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let sa: string, teacher: string, teacherId: string, ownerId: string;
  let fetchSpy: jest.SpyInstance;
  let counter = 0;
  let studentId: string;
  let grades: string[], subjects: string[];
  const trees: {
    course: string;
    chapter: string;
    lesson: string;
    section: string;
    video: string;
  }[] = [];
  const headers = (token = teacher) => ({ authorization: `Bearer ${token}` });
  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    payload?: any,
    token = teacher,
  ) {
    return app.inject({
      method,
      url: `/api/v1/${path}`,
      headers: headers(token),
      ...(payload === undefined ? {} : { payload }),
    });
  }
  async function login(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password },
    });
    expect(response.statusCode).toBe(201);
    return response;
  }
  async function item(courseId = trees[0].course) {
    const response = await call('POST', 'admin/content-items', {
      title: 'فيديو جديد',
      type: 'VIDEO',
      placement: { courseId },
    });
    expect(response.statusCode).toBe(201);
    return json(response).id as string;
  }
  async function upload(contentItemId: string) {
    const response = await call('POST', 'admin/video-assets', {
      title: 'فيديو',
      contentItemId,
    });
    expect(response.statusCode).toBe(201);
    return json(response).id as string;
  }
  async function ready(assetId: string) {
    await db.asset.update({
      where: { id: assetId },
      data: { status: 'READY' },
    });
    await db.videoAsset.update({
      where: { assetId },
      data: { processingStatus: 'READY' },
    });
  }
  async function linkedVideo() {
    const contentItemId = await item();
    const assetId = await upload(contentItemId);
    await ready(assetId);
    expect(
      (
        await call(
          'POST',
          `admin/content-items/${contentItemId}/primary-asset`,
          { assetId },
        )
      ).statusCode,
    ).toBe(201);
    return { contentItemId, assetId };
  }
  async function request(assetId: string) {
    const response = await call('POST', 'admin/video-deletion-requests', {
      assetId,
      reason: 'يرجى حذف الفيديو',
    });
    expect(response.statusCode).toBe(201);
    return json(response).id as string;
  }
  async function waitForBlockedQuery(pattern: string) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query LIKE ${pattern}
        ) AS blocked
      `;
      if (row.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Query did not wait for the deletion lock: ${pattern}`);
  }
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    await cleanDatabase(app);
    await flushTestRedis(app);
    ownerId = (await seedSuperAdmin(app, 'teacher-sa@example.com', password))
      .id;
    sa = json(await login('teacher-sa@example.com')).accessToken;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ guid: `teacher-bunny-${++counter}` }), {
          status: 200,
        }),
    );
    const actor = { createdById: ownerId, updatedById: ownerId };
    const governorate = await db.governorate.create({
      data: { nameAr: 'محافظة المعلم' },
    });
    studentId = (
      await db.user.create({
        data: {
          role: 'STUDENT',
          loginIdentifier: 'teacher-feedback-student',
          passwordHash: 'unused',
          studentProfile: {
            create: {
              fullName: 'Private student',
              nationalIdHash: 'teacher-feedback-hash',
              nationalIdLast4: '1234',
              governorate: 'Cairo',
              governorateId: governorate.id,
              parentPhoneNormalized: '01012345678',
            },
          },
        },
      })
    ).id;

    grades = [];
    for (let i = 0; i < 3; i++)
      grades.push(
        (
          await db.academicGrade.create({
            data: {
              titleAr: 'الصف',
              slug: `teacher-grade-${i}`,
              sortOrder: i + 1,
              ...actor,
            },
          })
        ).id,
      );
    subjects = [];
    for (let i = 0; i < 2; i++)
      subjects.push(
        (
          await db.subject.create({
            data: {
              title: 'مادة',
              slug: `teacher-subject-${i}`,
              sortOrder: i + 1,
              ...actor,
              gradeAssignments: {
                create: (i ? [grades[2]] : [grades[0], grades[1]]).map(
                  (academicGradeId) => ({ academicGradeId, sortOrder: 1 }),
                ),
              },
            },
          })
        ).id,
      );
    for (let i = 0; i < 3; i++) {
      const course = await db.course.create({
        data: {
          title: 'دورة',
          slug: `teacher-course-${i}`,
          subjectId: subjects[i === 2 ? 1 : 0],
          sortOrder: i + 1,
          ...actor,
        },
      });
      const chapter = await db.chapter.create({
        data: {
          title: 'فصل',
          slug: 'chapter',
          courseId: course.id,
          sortOrder: 1,
          ...actor,
        },
      });
      const lesson = await db.lesson.create({
        data: {
          title: 'درس',
          slug: 'lesson',
          chapterId: chapter.id,
          sortOrder: 1,
          ...actor,
        },
      });
      const section = await db.section.create({
        data: {
          title: 'قسم',
          slug: 'section',
          lessonId: lesson.id,
          sortOrder: 1,
          ...actor,
        },
      });
      const video = await db.contentItem.create({
        data: {
          type: 'VIDEO',
          title: 'فيديو',
          ...actor,
          placement: {
            create: {
              sectionId: section.id,
              subjectId: course.subjectId,
              resolvedCourseId: course.id,
              resolvedChapterId: chapter.id,
              resolvedLessonId: lesson.id,
              resolvedSectionId: section.id,
              sortOrder: 1,
            },
          },
        },
      });
      trees.push({
        course: course.id,
        chapter: chapter.id,
        lesson: lesson.id,
        section: section.id,
        video: video.id,
      });
    }
    const created = await call(
      'POST',
      'admin/admins',
      {
        email: 'teacher@example.com',
        password,
        role: Role.TEACHER,
        courseIds: [trees[0].course],
      },
      sa,
    );
    expect(created.statusCode).toBe(201);
    teacherId = json(created).id;
    const loggedIn = await login('teacher@example.com');
    teacher = json(loggedIn).accessToken;
    expect(json(loggedIn).user).toMatchObject({
      role: 'TEACHER',
      scope: { type: 'COURSES', courseIds: [trees[0].course] },
    });
  });
  afterAll(async () => {
    fetchSpy?.mockRestore();
    await app?.close();
  });

  it('returns consistent current scope on management, me and refresh', async () => {
    for (const response of [
      await call('GET', `admin/admins/${teacherId}`, undefined, sa),
      await call('GET', 'auth/me'),
    ])
      expect(json(response).scope).toEqual({
        type: 'COURSES',
        courseIds: [trees[0].course],
      });
    const loggedIn = await login('teacher@example.com');
    const cookie = String(loggedIn.headers['set-cookie']).split(';')[0];
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://admin.jibal-platform.com', cookie },
    });
    expect(refreshed.statusCode).toBe(201);
    expect(json(refreshed).user.scope).toEqual(json(loggedIn).user.scope);
    expect(json(await call('GET', 'auth/me', undefined, sa)).scope).toBeNull();
  });
  it.each([
    ['academic-grades', 'الصف', 'grade'],
    ['subjects', 'مادة', 'subject'],
    ['courses', 'دورة', 'course'],
    ['chapters', 'فصل', 'chapter'],
    ['lessons', 'درس', 'lesson'],
    ['sections', 'قسم', 'section'],
    ['content-items', 'فيديو', 'video'],
  ])(
    'scopes %s reads, Arabic search, totals and direct IDs',
    async (path, q, field) => {
      const expected =
        field === 'grade'
          ? grades.slice(0, 2)
          : field === 'subject'
            ? [subjects[0]]
            : [trees[0][field as keyof (typeof trees)[0]]];
      for (const suffix of ['', `?q=${encodeURIComponent(q)}`]) {
        const response = await call('GET', `admin/${path}${suffix}`);
        expect(response.statusCode).toBe(200);
        const result = json(response);
        expect(result.data.map((r: any) => r.id).sort()).toEqual(
          [...expected].sort(),
        );
        expect(result.meta.total).toBe(expected.length);
      }
      const accessible = expected[0];
      const inaccessible =
        field === 'grade'
          ? grades[2]
          : field === 'subject'
            ? subjects[1]
            : trees[2][field as keyof (typeof trees)[0]];
      expect(
        (await call('GET', `admin/${path}/${accessible}`)).statusCode,
      ).toBe(200);
      expect(
        (await call('GET', `admin/${path}/${inaccessible}`)).statusCode,
      ).toBe(404);
    },
  );
  it('keeps shared-grade subjects and counts scoped', async () => {
    for (const gradeId of grades.slice(0, 2)) {
      const response = json(
        await call(
          'GET',
          `admin/subjects?academicGradeId=${gradeId}&q=${encodeURIComponent('مادة')}`,
        ),
      );
      expect(response.data).toHaveLength(1);
      expect(response.data[0].hasChildren).toBe(true);
    }
    const filtered = json(
      await call(
        'GET',
        `admin/content-items?courseIds=${trees[0].course},${trees[1].course}&limit=1`,
      ),
    );
    expect(filtered.meta.total).toBe(1);
    expect(
      json(await call('GET', `admin/chapters?courseId=${trees[1].course}`))
        .data,
    ).toEqual([]);
  });
  it('removes scope immediately for an existing token and allows an empty assignment', async () => {
    expect(
      (
        await call(
          'PUT',
          `admin/admins/${teacherId}/scope`,
          { courseIds: [] },
          sa,
        )
      ).statusCode,
    ).toBe(200);
    for (const path of [
      'academic-grades',
      'subjects',
      'courses',
      'chapters',
      'lessons',
      'sections',
      'content-items',
    ])
      expect(json(await call('GET', `admin/${path}`)).meta.total).toBe(0);
    expect(
      (await call('GET', `admin/content-items/${trees[0].video}`)).statusCode,
    ).toBe(404);
    expect(json(await call('GET', 'auth/me')).scope.courseIds).toEqual([]);
    await call(
      'PUT',
      `admin/admins/${teacherId}/scope`,
      { courseIds: [trees[0].course] },
      sa,
    );
  });
  it('preserves status defaults and scopes pagination and child summaries', async () => {
    const archived = await db.course.create({
      data: {
        title: 'دورة مؤرشفة',
        slug: 'teacher-archived',
        subjectId: subjects[0],
        status: 'ARCHIVED',
        sortOrder: 9,
        createdById: ownerId,
        updatedById: ownerId,
      },
    });
    await call(
      'PUT',
      `admin/admins/${teacherId}/scope`,
      { courseIds: [trees[0].course, archived.id] },
      sa,
    );
    expect(json(await call('GET', 'admin/courses')).meta.total).toBe(1);
    expect(
      json(await call('GET', 'admin/courses?status=ARCHIVED')).data.map(
        (row: any) => row.id,
      ),
    ).toEqual([archived.id]);
    const page = json(
      await call(
        'GET',
        `admin/academic-grades?limit=1&page=2&q=${encodeURIComponent('الصف')}`,
      ),
    );
    expect(page.meta.total).toBe(2);
    expect(page.data).toHaveLength(1);
    await call(
      'PUT',
      `admin/admins/${teacherId}/scope`,
      { courseIds: [archived.id] },
      sa,
    );
    expect(
      json(await call('GET', `admin/subjects/${subjects[0]}`)).hasChildren,
    ).toBe(false);
    await call(
      'PUT',
      `admin/admins/${teacherId}/scope`,
      { courseIds: [trees[0].course] },
      sa,
    );
  });

  it('binds uploads before authorization and restricts draft edits and replacements', async () => {
    expect(
      (await call('POST', 'admin/video-assets', { title: 'unbound' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call('POST', 'admin/video-assets', {
          title: 'outside',
          contentItemId: trees[1].video,
        })
      ).statusCode,
    ).toBe(404);
    const id = await item();
    const assetId = await upload(id);
    expect(
      (await db.asset.findUnique({ where: { id: assetId } }))
        ?.uploadContentItemId,
    ).toBe(id);
    expect(
      (await call('POST', `admin/video-assets/${assetId}/upload-authorization`))
        .statusCode,
    ).toBe(201);
    expect(
      (await call('POST', `admin/video-assets/${assetId}/upload-confirmation`))
        .statusCode,
    ).toBe(201);
    await db.asset.update({
      where: { id: assetId },
      data: { status: 'FAILED' },
    });
    expect(
      (await call('POST', `admin/video-assets/${assetId}/retry`)).statusCode,
    ).toBe(201);
    expect(
      (await db.videoAsset.findUnique({ where: { assetId } }))
        ?.clientUploadCompletedAt,
    ).toBeNull();
    expect(
      (
        await call('PATCH', `admin/content-items/${id}`, {
          title: 'edited',
          description: 'description',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call('PATCH', `admin/content-items/${id}`, {
          accessType: 'PUBLIC',
        })
      ).statusCode,
    ).toBe(403);
    await ready(assetId);
    expect(
      (
        await call('POST', `admin/content-items/${id}/primary-asset`, {
          assetId,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call('POST', `admin/content-items/${id}/primary-asset`, {
          assetId,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', `admin/video-assets/${assetId}/upload-authorization`))
        .statusCode,
    ).toBe(403);
    expect(
      (await call('GET', `admin/video-assets/${assetId}/playback`)).statusCode,
    ).toBe(200);
    await db.contentItem.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
    expect(
      (await call('PATCH', `admin/content-items/${id}`, { title: 'denied' }))
        .statusCode,
    ).toBe(403);
  });
  it.each([
    ['POST', 'admin/courses', { title: 'x' }],
    ['POST', `admin/content-items/${'missing'}/publish`, {}],
    ['POST', 'admin/content-items/reorder', {}],
    ['DELETE', 'admin/content-items/missing', undefined],
    ['DELETE', 'admin/video-assets/missing', undefined],
    ['DELETE', 'admin/assets/missing', undefined],
    ['DELETE', 'admin/video-feedback/missing', undefined],
    ['GET', 'admin/students', undefined],
    ['GET', 'admin/questions', undefined],
    ['GET', 'admin/admins', undefined],
    ['GET', 'admin/assets', undefined],
  ] as const)('denies teacher %s %s', async (method, path, payload) =>
    expect((await call(method, path, payload)).statusCode).toBe(403),
  );

  it('reads feedback for every assigned-course video without student identity or filters', async () => {
    const { assetId } = await linkedVideo();
    await db.videoFeedback.create({
      data: {
        videoAssetId: assetId,
        studentUserId: studentId,
        rating: 4,
        comment: 'مفيد',
      },
    });
    const response = await call('GET', 'admin/video-feedback');
    expect(response.statusCode).toBe(200);
    expect(json(response).data).toHaveLength(1);
    expect(json(response).data[0]).toMatchObject({
      rating: 4,
      comment: 'مفيد',
    });
    expect(response.body).not.toContain(studentId);
    expect(response.body).not.toContain('Private student');
    expect(
      (await call('GET', `admin/video-feedback?studentId=${studentId}`))
        .statusCode,
    ).toBe(403);
    await call('PUT', `admin/admins/${teacherId}/scope`, { courseIds: [] }, sa);
    expect(json(await call('GET', 'admin/video-feedback')).meta.total).toBe(0);
    await call(
      'PUT',
      `admin/admins/${teacherId}/scope`,
      { courseIds: [trees[0].course] },
      sa,
    );
  });

  it.each(['detach', 'replace', 'move'] as const)(
    'blocks a concurrent %s after approval validates the target',
    async (operation) => {
      const { contentItemId, assetId } = await linkedVideo();
      const replacement = await upload(await item());
      await ready(replacement);
      const id = await request(assetId);
      const service = app.get(VideoDeletionRequestsService);
      // Pause after the real target read, while approval still holds its locks.
      const internal = service as unknown as {
        target: (...args: unknown[]) => Promise<unknown>;
      };
      const target = internal.target.bind(service);
      let release!: () => void;
      let reached!: () => void;
      const paused = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest
        .spyOn(internal, 'target')
        .mockImplementationOnce(async (...args) => {
          const result = await target(...args);
          reached();
          await resume;
          return result;
        });
      // Retain the item after approval so the waiting writer must check the
      // committed marker rather than merely updating an already deleted row.
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
      const approval = call(
        'POST',
        `admin/video-deletion-requests/${id}/approve`,
        {},
        sa,
      );
      await paused;
      const edit =
        operation === 'move'
          ? db.$executeRaw`/* teacher-deletion-race */ UPDATE "ContentPlacement"
            SET "courseId" = ${trees[1].course}, "resolvedCourseId" = ${trees[1].course}
            WHERE "contentItemId" = ${contentItemId}`
          : db.$executeRaw`/* teacher-deletion-race */ UPDATE "ContentItem"
            SET "primaryAssetId" = ${operation === 'detach' ? null : replacement}
            WHERE id = ${contentItemId}`;
      const edited = edit.then(
        () => null,
        (error: unknown) => error,
      );
      try {
        await waitForBlockedQuery('%/* teacher-deletion-race */%');
      } finally {
        release();
      }
      try {
        const result = json(await approval) as { execution: string };
        expect(result.execution).toBe('FAILED');
        expect(String(await edited)).toContain('Video deletion is in progress');
        expect(
          await db.contentItem.findUnique({ where: { id: contentItemId } }),
        ).toMatchObject({ primaryAssetId: assetId });
        expect(
          await db.contentPlacement.findUnique({ where: { contentItemId } }),
        ).toMatchObject({ resolvedCourseId: trees[0].course });
      } finally {
        spy.mockRestore();
      }
      const retried = json(
        await call('POST', `admin/video-deletion-requests/${id}/retry`, {}, sa),
      ) as { execution: string };
      expect(retried.execution).toBe('COMPLETED');
    },
  );

  it('rejects approval when a concurrent move commits before validation', async () => {
    const { contentItemId, assetId } = await linkedVideo();
    const id = await request(assetId);
    let release!: () => void;
    let reached!: () => void;
    const moved = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = db.$transaction(async (tx) => {
      await tx.contentPlacement.update({
        where: { contentItemId },
        data: { courseId: trees[1].course, resolvedCourseId: trees[1].course },
      });
      reached();
      await resume;
    });
    await moved;
    const calls = fetchSpy.mock.calls.length;
    const approval = call(
      'POST',
      `admin/video-deletion-requests/${id}/approve`,
      {},
      sa,
    );
    try {
      await waitForBlockedQuery('%FROM "ContentPlacement"%FOR UPDATE%');
    } finally {
      release();
    }
    await edit;
    expect((await approval).statusCode).toBe(409);
    expect(fetchSpy.mock.calls).toHaveLength(calls);
    expect(
      await db.contentItem.findUnique({ where: { id: contentItemId } }),
    ).not.toBeNull();
    expect(await db.asset.findUnique({ where: { id: assetId } })).toMatchObject(
      { deletionStartedAt: null },
    );
  });

  it('serializes concurrent approval and refuses a simultaneous retry', async () => {
    const { assetId } = await linkedVideo();
    const id = await request(assetId);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchSpy.mockImplementationOnce(async () => {
      started();
      await barrier;
      return new Response(null, { status: 200 });
    });
    const calls = fetchSpy.mock.calls.length;
    const first = call(
      'POST',
      `admin/video-deletion-requests/${id}/approve`,
      {},
      sa,
    );
    await entered;
    const second = call(
      'POST',
      `admin/video-deletion-requests/${id}/approve`,
      {},
      sa,
    );
    const retry = await call(
      'POST',
      `admin/video-deletion-requests/${id}/retry`,
      {},
      sa,
    );
    expect(retry.statusCode).toBe(409);
    release();
    const responses = await Promise.all([first, second]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(fetchSpy.mock.calls.length - calls).toBe(1);
  });

  it('recovers after remote deletion succeeds but local cleanup fails', async () => {
    const { assetId } = await linkedVideo();
    const id = await request(assetId);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION teacher_test_fail_asset_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Temporary local cleanup failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER teacher_test_fail_delete BEFORE DELETE ON "Asset" FOR EACH ROW EXECUTE FUNCTION teacher_test_fail_asset_delete()`,
    );
    let failed: any;
    try {
      failed = json(
        await call(
          'POST',
          `admin/video-deletion-requests/${id}/approve`,
          {},
          sa,
        ),
      );
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER teacher_test_fail_delete ON "Asset"',
      );
      await db.$executeRawUnsafe(
        'DROP FUNCTION teacher_test_fail_asset_delete()',
      );
    }
    expect(failed.execution).toBe('FAILED');
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(
      json(
        await call('POST', `admin/video-deletion-requests/${id}/retry`, {}, sa),
      ).execution,
    ).toBe('COMPLETED');
  });

  it('rejects duplicates and rejection has no content or provider side effects', async () => {
    const { contentItemId, assetId } = await linkedVideo();
    const id = await request(assetId);
    const calls = fetchSpy.mock.calls.length;
    expect(
      (
        await call('POST', 'admin/video-deletion-requests', {
          assetId,
          reason: 'again',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          `admin/video-deletion-requests/${id}/reject`,
          { reason: 'keep it' },
          sa,
        )
      ).statusCode,
    ).toBe(201);
    expect(
      await db.contentItem.findUnique({ where: { id: contentItemId } }),
    ).not.toBeNull();
    expect(
      (await db.asset.findUnique({ where: { id: assetId } }))
        ?.deletionStartedAt,
    ).toBeNull();
    expect(fetchSpy.mock.calls).toHaveLength(calls);
    await request(assetId);
  });
  it('previews references globally, cleans links and preserves assessment snapshots and results', async () => {
    const { contentItemId, assetId } = await linkedVideo();
    await db.assetReference.create({
      data: { contentItemId: trees[1].video, assetId, sortOrder: 1 },
    });
    const bank = await db.questionBank.create({
      data: {
        title: 'Global bank',
        subjectId: subjects[0],
        createdById: ownerId,
        updatedById: ownerId,
      },
    });
    const source = await db.questionSource.create({
      data: {
        type: 'PLATFORM',
        titleAr: 'مصدر',
        createdById: ownerId,
        updatedById: ownerId,
      },
    });
    const question = await db.question.create({
      data: {
        bankId: bank.id,
        sourceId: source.id,
        courseId: trees[1].course,
        body: 'Keep live question',
        createdById: ownerId,
        updatedById: ownerId,
        videoLink: { create: { videoAssetId: assetId, timestampSeconds: 15 } },
        contentBlocks: { create: { type: 'ASSET', sortOrder: 1, assetId } },
      },
    });
    await db.videoFeedback.create({
      data: { videoAssetId: assetId, studentUserId: studentId, rating: 5 },
    });
    const assessment = await db.assessment.create({
      data: {
        title: 'Preserved assessment',
        subjectId: subjects[0],
        ownerType: 'ADMIN',
        createdByAdminId: ownerId,
        generationType: 'STANDARD',
        questionCount: 1,
        questions: {
          create: {
            sourceQuestionId: 'historical-question',
            sortOrder: 1,
            type: 'SINGLE_CHOICE',
            body: 'Keep question',
            maxPoints: 5,
            videoAssetId: assetId,
            videoAssetName: 'video',
            timestampSeconds: 10,
          },
        },
      },
      include: { questions: true },
    });
    await db.assessmentQuestionAsset.create({
      data: {
        assessmentQuestionId: assessment.questions[0].id,
        assetId,
        assetKind: 'VIDEO',
        assetName: 'Historical video',
        sortOrder: 1,
      },
    });
    const block = await db.assessmentQuestionContentBlock.create({
      data: {
        assessmentQuestionId: assessment.questions[0].id,
        assetId,
        type: 'ASSET',
        assetKind: 'VIDEO',
        assetName: 'Historical video',
        sortOrder: 1,
      },
    });
    const attempt = await db.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id,
        studentUserId: studentId,
        status: 'COMPLETED',
        score: 5,
        totalPoints: 5,
        totalQuestions: 1,
        answers: {
          create: {
            assessmentQuestionId: assessment.questions[0].id,
            selectedOptionIds: [],
            responseText: 'Original answer',
            outcome: 'CORRECT',
            awardedPoints: 5,
          },
        },
      },
      include: { answers: true },
    });
    const id = await request(assetId);
    const detail = json(
      await call('GET', `admin/video-deletion-requests/${id}`, undefined, sa),
    );
    expect(detail.affectedReferences.assetReference.count).toBe(1);
    expect(detail.affectedReferences.questionVideoLink.count).toBe(1);
    expect(detail.affectedReferences.videoFeedback.count).toBe(1);
    expect(detail.affectedReferences.assessmentQuestion.count).toBe(1);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const approval = await call(
      'POST',
      `admin/video-deletion-requests/${id}/approve`,
      {},
      sa,
    );
    expect(approval.statusCode).toBe(201);
    expect(json(approval).execution).toBe('COMPLETED');
    expect(await db.asset.findUnique({ where: { id: assetId } })).toBeNull();
    expect(
      await db.contentItem.findUnique({ where: { id: contentItemId } }),
    ).toBeNull();
    expect(
      await db.contentItem.findUnique({ where: { id: trees[1].video } }),
    ).not.toBeNull();
    expect(await db.assetReference.count({ where: { assetId } })).toBe(0);
    expect(
      await db.assessmentQuestion.findUnique({
        where: { id: assessment.questions[0].id },
      }),
    ).toMatchObject({
      body: 'Keep question',
      maxPoints: 5,
      videoAssetId: null,
      timestampSeconds: null,
    });
    expect(
      (
        await call(
          'POST',
          `admin/video-deletion-requests/${id}/approve`,
          {},
          sa,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      await db.assessmentAttempt.findUnique({ where: { id: attempt.id } }),
    ).toMatchObject({ score: 5, status: 'COMPLETED' });
    expect(
      await db.assessmentAttemptAnswer.findUnique({
        where: { id: attempt.answers[0].id },
      }),
    ).toMatchObject({
      responseText: 'Original answer',
      awardedPoints: 5,
      outcome: 'CORRECT',
    });
    expect(
      await db.question.findUnique({ where: { id: question.id } }),
    ).not.toBeNull();
    expect(
      await db.questionVideoLink.count({ where: { videoAssetId: assetId } }),
    ).toBe(0);
    expect(
      await db.videoFeedback.count({ where: { videoAssetId: assetId } }),
    ).toBe(0);
    expect(
      await db.assessmentQuestionContentBlock.findUnique({
        where: { id: block.id },
      }),
    ).toMatchObject({ assetId: null, assetName: 'Historical video' });
    await expect(
      db.assessmentQuestion.update({
        where: { id: assessment.questions[0].id },
        data: { videoAssetId: assetId },
      }),
    ).rejects.toThrow();
  });

  it('retains failure details, blocks playback/references/replacement, and retries after Bunny failure', async () => {
    const { contentItemId, assetId } = await linkedVideo();
    const id = await request(assetId);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const approval = json(
      await call('POST', `admin/video-deletion-requests/${id}/approve`, {}, sa),
    );
    expect(approval.execution).toBe('FAILED');
    expect(approval.failureDetails).toContain('503');
    expect(
      (await db.asset.findUnique({ where: { id: assetId } }))
        ?.deletionStartedAt,
    ).not.toBeNull();
    expect(
      (
        await call(
          'GET',
          `admin/video-assets/${assetId}/playback`,
          undefined,
          sa,
        )
      ).statusCode,
    ).toBe(409);
    await expect(
      db.assetReference.create({
        data: { contentItemId: trees[1].video, assetId, sortOrder: 1 },
      }),
    ).rejects.toThrow();
    await expect(
      db.contentItem.update({
        where: { id: contentItemId },
        data: { primaryAssetId: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.contentPlacement.delete({ where: { contentItemId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.contentItem.delete({ where: { id: contentItemId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const retried = json(
      await call('POST', `admin/video-deletion-requests/${id}/retry`, {}, sa),
    );
    expect(retried.execution).toBe('COMPLETED');
    expect(retried.attempts).toBe(2);
  });
  it('conflicts on changed targets and keeps unfinished uploads requestable only by their owner', async () => {
    const id = await item();
    const assetId = await upload(id);
    const requestId = await request(assetId);
    await db.contentPlacement.update({
      where: { contentItemId: id },
      data: { courseId: trees[1].course, resolvedCourseId: trees[1].course },
    });
    expect(
      (
        await call(
          'POST',
          `admin/video-deletion-requests/${requestId}/approve`,
          {},
          sa,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await call('GET', `admin/video-assets/${assetId}`)).statusCode,
    ).toBe(404);
    expect(
      (await db.videoDeletionRequest.findUnique({ where: { id: requestId } }))
        ?.decision,
    ).toBe('REJECTED');
    await db.contentPlacement.update({
      where: { contentItemId: id },
      data: { courseId: trees[0].course, resolvedCourseId: trees[0].course },
    });
    await request(assetId);
  });
  it('restricts request history to its requester and accepts deletion of a scoped unfinished upload', async () => {
    const contentItemId = await item();
    const assetId = await upload(contentItemId);
    const id = await request(assetId);
    await call(
      'POST',
      'admin/admins',
      {
        email: 'second-teacher@example.com',
        password,
        role: 'TEACHER',
        courseIds: [trees[0].course],
      },
      sa,
    );
    const second = json(await login('second-teacher@example.com')).accessToken;
    expect(
      json(
        await call('GET', 'admin/video-deletion-requests', undefined, second),
      ).meta.total,
    ).toBe(0);
    expect(
      (
        await call(
          'GET',
          `admin/video-deletion-requests/${id}`,
          undefined,
          second,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'POST',
          'admin/video-deletion-requests',
          { assetId, reason: 'Not my upload' },
          second,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `admin/video-deletion-requests/${id}/approve`, {}))
        .statusCode,
    ).toBe(403);
    expect(
      json(
        await call(
          'POST',
          `admin/video-deletion-requests/${id}/approve`,
          {},
          sa,
        ),
      ).execution,
    ).toBe('COMPLETED');
    expect(
      await db.contentItem.findUnique({ where: { id: contentItemId } }),
    ).toBeNull();
  });

  it.each(['UNATTACHED', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const)(
    'preserves another bound upload when deleting a video (%s)',
    async (status) => {
      const contentItemId = await item();
      const first = await upload(contentItemId);
      const second = await upload(contentItemId);
      if (status !== 'UNATTACHED') {
        await ready(first);
        expect(
          (
            await call(
              'POST',
              `admin/content-items/${contentItemId}/primary-asset`,
              { assetId: first },
            )
          ).statusCode,
        ).toBe(201);
      }
      if (status === 'PUBLISHED' || status === 'ARCHIVED') {
        await db.contentItem.update({
          where: { id: contentItemId },
          data: {
            status,
            publishedAt: new Date(),
            archivedAt: status === 'ARCHIVED' ? new Date() : null,
          },
        });
      }
      const id = await request(first);
      expect(
        execution(
          await call(
            'POST',
            `admin/video-deletion-requests/${id}/approve`,
            {},
            sa,
          ),
        ),
      ).toBe('COMPLETED');
      expect(
        await db.contentItem.findUnique({ where: { id: contentItemId } }),
      ).toMatchObject({
        primaryAssetId: null,
        status: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
      });
      expect(
        (await call('GET', `admin/video-assets/${second}`)).statusCode,
      ).toBe(200);
      expect(
        (
          await call(
            'POST',
            `admin/video-assets/${second}/upload-authorization`,
          )
        ).statusCode,
      ).toBe(201);
      await ready(second);
      expect(
        (
          await call(
            'POST',
            `admin/content-items/${contentItemId}/primary-asset`,
            { assetId: second },
          )
        ).statusCode,
      ).toBe(201);
      const last = await request(second);
      expect(
        execution(
          await call(
            'POST',
            `admin/video-deletion-requests/${last}/approve`,
            {},
            sa,
          ),
        ),
      ).toBe('COMPLETED');
      expect(
        await db.contentItem.findUnique({ where: { id: contentItemId } }),
      ).toBeNull();
    },
  );

  it('serializes new uploads with approval and rejects bindings after deletion starts', async () => {
    const contentItemId = await item();
    const assetId = await upload(contentItemId);
    const id = await request(assetId);
    const service = app.get(VideoDeletionRequestsService);
    const internal = service as unknown as {
      target: (...args: unknown[]) => Promise<unknown>;
    };
    const target = internal.target.bind(service);
    let release!: () => void;
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = jest
      .spyOn(internal, 'target')
      .mockImplementationOnce(async (...args) => {
        const result = await target(...args);
        reached();
        await resume;
        return result;
      });
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const calls = fetchSpy.mock.calls.length;
    const approval = call(
      'POST',
      `admin/video-deletion-requests/${id}/approve`,
      {},
      sa,
    );
    await paused;
    const creating = call('POST', 'admin/video-assets', {
      title: 'Blocked upload',
      contentItemId,
    });
    try {
      await waitForBlockedQuery('%FROM "ContentItem"%FOR UPDATE%');
    } finally {
      release();
      spy.mockRestore();
    }
    expect(execution(await approval)).toBe('FAILED');
    expect((await creating).statusCode).toBe(409);
    expect(fetchSpy.mock.calls.length - calls).toBe(1);
    const after = await call('POST', 'admin/video-assets', {
      title: 'Blocked upload',
      contentItemId,
    });
    expect(after.statusCode).toBe(409);
    expect(fetchSpy.mock.calls.length - calls).toBe(1);
    await expect(
      db.asset.create({
        data: {
          provider: 'BUNNY_STREAM',
          kind: 'VIDEO',
          originalFilename: 'blocked',
          filename: 'blocked',
          mimeType: 'video/*',
          uploadedById: teacherId,
          uploadContentItemId: contentItemId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await db.asset.count({ where: { uploadContentItemId: contentItemId } }),
    ).toBe(1);
    expect(
      execution(
        await call('POST', `admin/video-deletion-requests/${id}/retry`, {}, sa),
      ),
    ).toBe('COMPLETED');
  });

  it('supports teacher lifecycle through existing administrator management', async () => {
    expect(
      (
        await call(
          'PATCH',
          `admin/admins/${teacherId}`,
          { email: 'teacher-updated@example.com' },
          sa,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('POST', `admin/admins/${teacherId}/suspend`, {}, sa))
        .statusCode,
    ).toBe(201);
    expect((await call('GET', 'auth/me')).statusCode).toBe(401);
    expect(
      (await call('POST', `admin/admins/${teacherId}/reactivate`, {}, sa))
        .statusCode,
    ).toBe(201);
    const reset = json(
      await call('POST', `admin/admins/${teacherId}/reset-password`, {}, sa),
    );
    expect(reset.temporaryPassword).toBeTruthy();
  });
});
