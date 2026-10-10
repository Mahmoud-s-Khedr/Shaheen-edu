import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/database/prisma.service';
import type { PaginationMeta } from '../src/common/dto/pagination-query.dto';
import {
  ContentStatus,
  QuestionSourceType,
  QuestionStatus,
} from '../src/common/types/roles.enum';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';

type QuestionListResponse = {
  data: Array<{ id: string; courseId: string }>;
  meta: PaginationMeta;
};

describe('Admin question list hierarchy filters (e2e)', () => {
  let app: NestFastifyApplication;
  let headers: { authorization: string };
  const ids: Record<string, string> = {};
  const questions: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    await flushTestRedis(app);
    const prisma = app.get(PrismaService);
    await cleanDatabase(app);
    const admin = await seedSuperAdmin(
      app,
      'question-filters@example.com',
      'SuperAdminP@ss1!',
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'question-filters@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    expect(login.statusCode).toBe(201);
    const auth = JSON.parse(login.body) as { accessToken: string };
    headers = { authorization: `Bearer ${auth.accessToken}` };
    const owner = {
      createdById: admin.id,
      updatedById: admin.id,
      status: ContentStatus.PUBLISHED,
    };
    for (const n of [1, 2]) {
      const grade = await prisma.academicGrade.create({
        data: {
          ...owner,
          titleAr: `Grade ${n}`,
          slug: `filter-grade-${n}`,
          sortOrder: n,
        },
      });
      const subject = await prisma.subject.create({
        data: {
          ...owner,
          title: `Subject ${n}`,
          slug: `filter-subject-${n}`,
          sortOrder: n,
          gradeAssignments: {
            create: { academicGradeId: grade.id, sortOrder: 1 },
          },
        },
      });
      const course = await prisma.course.create({
        data: {
          ...owner,
          subjectId: subject.id,
          title: `Course ${n}`,
          slug: `filter-course-${n}`,
          sortOrder: 1,
        },
      });
      const chapter = await prisma.chapter.create({
        data: {
          ...owner,
          courseId: course.id,
          title: `Chapter ${n}`,
          slug: `filter-chapter-${n}`,
          sortOrder: 1,
        },
      });
      const lesson = await prisma.lesson.create({
        data: {
          ...owner,
          chapterId: chapter.id,
          title: `Lesson ${n}`,
          slug: `filter-lesson-${n}`,
          sortOrder: 1,
        },
      });
      const section = await prisma.section.create({
        data: {
          ...owner,
          lessonId: lesson.id,
          title: `Section ${n}`,
          slug: `filter-section-${n}`,
          sortOrder: 1,
        },
      });
      Object.assign(ids, {
        [`grade${n}`]: grade.id,
        [`subject${n}`]: subject.id,
        [`course${n}`]: course.id,
        [`chapter${n}`]: chapter.id,
        [`lesson${n}`]: lesson.id,
        [`section${n}`]: section.id,
      });
      const bank = await prisma.questionBank.create({
        data: { ...owner, subjectId: subject.id, title: `Bank ${n}` },
      });
      const source = await prisma.questionSource.create({
        data: {
          ...owner,
          type: QuestionSourceType.PLATFORM,
          titleAr: `Source ${n}`,
        },
      });
      for (const target of ['course', 'chapter', 'lesson', 'section']) {
        const question = await prisma.question.create({
          data: {
            ...owner,
            status: QuestionStatus.DRAFT,
            bankId: bank.id,
            sourceId: source.id,
            courseId: course.id,
            body: 'Hierarchy filter marker',
            placements: { create: { [`${target}Id`]: ids[`${target}${n}`] } },
          },
        });
        questions[`${target}${n}`] = question.id;
      }
      if (n === 1) {
        const archived = await prisma.question.create({
          data: {
            ...owner,
            status: QuestionStatus.ARCHIVED,
            bankId: bank.id,
            sourceId: source.id,
            courseId: course.id,
            body: 'Hierarchy filter marker',
            placements: { create: { sectionId: section.id } },
          },
        });
        questions.archived = archived.id;
      }
    }
    // A question with separate placements must not satisfy incompatible
    // chapter/lesson filters by matching a different placement for each.
    const sibling = await prisma.chapter.create({
      data: {
        ...owner,
        courseId: ids.course1,
        title: 'Sibling',
        slug: 'filter-sibling',
        sortOrder: 2,
      },
    });
    ids.sibling = sibling.id;
    await prisma.question.update({
      where: { id: questions.course1 },
      data: {
        placements: {
          create: [{ chapterId: sibling.id }, { lessonId: ids.lesson1 }],
        },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const cases: Array<[string, Record<string, string>, string[]]> = [
    [
      'course',
      { courseId: 'course1' },
      ['course1', 'chapter1', 'lesson1', 'section1'],
    ],
    [
      'subject',
      { subjectId: 'subject1' },
      ['course1', 'chapter1', 'lesson1', 'section1'],
    ],
    [
      'grade',
      { academicGradeId: 'grade1' },
      ['course1', 'chapter1', 'lesson1', 'section1'],
    ],
    [
      'chapter and descendants',
      { chapterId: 'chapter1' },
      ['course1', 'chapter1', 'lesson1', 'section1'],
    ],
    [
      'lesson and descendants',
      { lessonId: 'lesson1' },
      ['course1', 'lesson1', 'section1'],
    ],
    ['section', { sectionId: 'section1' }, ['section1']],
    [
      'all six filters',
      {
        courseId: 'course1',
        subjectId: 'subject1',
        academicGradeId: 'grade1',
        chapterId: 'chapter1',
        lessonId: 'lesson1',
        sectionId: 'section1',
      },
      ['section1'],
    ],
    [
      'mismatched course and subject',
      { courseId: 'course1', subjectId: 'subject2' },
      [],
    ],
    [
      'mismatched subject and grade',
      { subjectId: 'subject1', academicGradeId: 'grade2' },
      [],
    ],
    [
      'mismatched course and placement',
      { courseId: 'course1', sectionId: 'section2' },
      [],
    ],
    [
      'mismatched chapter and lesson',
      { chapterId: 'chapter1', lessonId: 'lesson2' },
      [],
    ],
    [
      'mismatched lesson and section',
      { lessonId: 'lesson1', sectionId: 'section2' },
      [],
    ],
    [
      'separate placements cannot satisfy incompatible filters',
      { chapterId: 'sibling', lessonId: 'lesson1' },
      [],
    ],
    [
      'explicit archived status',
      { sectionId: 'section1', status: 'ARCHIVED' },
      ['archived'],
    ],
    ...[
      'courseId',
      'subjectId',
      'academicGradeId',
      'chapterId',
      'lessonId',
      'sectionId',
    ].map((key): [string, Record<string, string>, string[]] => [
      `unknown ${key}`,
      { [key]: 'missing' },
      [],
    ]),
  ];

  describe.each([false, true])('with text search: %s', (search) => {
    it.each(cases)('%s', async (_name, filters, expected) => {
      const query = new URLSearchParams({ page: '1', limit: '100' });
      for (const [key, value] of Object.entries(filters))
        query.set(key, ids[value] ?? value);
      if (search) query.set('q', 'Hierarchy filter marker');
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/questions?${query}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as QuestionListResponse;
      expect(
        body.data.map((question: { id: string }) => question.id).sort(),
      ).toEqual(expected.map((key) => questions[key]).sort());
      expect(body.meta).toEqual({
        page: 1,
        limit: 100,
        total: expected.length,
        totalPages: expected.length ? 1 : 0,
      });
    });

    it('paginates filtered results without losing the total', async () => {
      const query = new URLSearchParams({
        courseId: ids.course1,
        page: '2',
        limit: '2',
      });
      if (search) query.set('q', 'Hierarchy filter marker');
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/questions?${query}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as QuestionListResponse;
      expect(body.data).toHaveLength(2);
      expect(
        body.data.every(
          (question: { courseId: string }) => question.courseId === ids.course1,
        ),
      ).toBe(true);
      expect(body.meta).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    });
  });
});
