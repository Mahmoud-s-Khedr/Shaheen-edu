/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedPublishedAcademicGrade, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { AccessType, ContentStatus, QuestionSourceType, QuestionStatus, QuestionType } from '../src/common/types/roles.enum';
import { QuestionCommunityStatsService } from '../src/modules/question-banks/question-community-stats.service';

const superAdminEmail = 'assessments-admin@example.com';
const superAdminPassword = 'SuperAdminP@ss1!';

async function registerStudent(app: NestFastifyApplication, academicGradeId: string, governorateId: string, nationalId: string, phone: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/students/register',
    payload: {
      fullName: 'Assessments E2E Student',
      nationalId,
      phone,
      parentPhone: '01088887777',
      governorateId,
      password: 'StudentP@ss1!',
      academicGradeId,
    },
  });
  expect(response.statusCode).toBe(201);
  const body = JSON.parse(response.body);
  return { accessToken: body.accessToken as string, userId: body.user.id as string };
}

describe('Assessments (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let student1: { accessToken: string; userId: string };
  let student2: { accessToken: string; userId: string };
  let courseId: string;
  let subjectId: string;
  let questionBankId: string;
  let sourceId: string;
  let questionIds: string[];

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    prisma = app.get(PrismaService);

    const admin = await seedSuperAdmin(app, superAdminEmail, superAdminPassword);
    const adminLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/admins/login', payload: { email: superAdminEmail, password: superAdminPassword } });
    adminToken = JSON.parse(adminLogin.body).accessToken;

    const gradeId = (await seedPublishedAcademicGrade(app, 'assessments-e2e-grade')).id;
    const governorate = await prisma.governorate.upsert({ where: { nameAr: 'محافظة اختبار التقييمات' }, create: { nameAr: 'محافظة اختبار التقييمات' }, update: {} });
    student1 = await registerStudent(app, gradeId, governorate.id, '29902020211111', '01011112222');
    student2 = await registerStudent(app, gradeId, governorate.id, '29902020222222', '01022223333');

    const now = new Date();
    const subject = await prisma.subject.create({
      data: { academicGradeId: gradeId, title: 'Assessments Subject', slug: 'assessments-subject', sortOrder: 1, status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id },
    });
    subjectId = subject.id;
    const course = await prisma.course.create({
      data: { subjectId: subject.id, title: 'Assessments Course', slug: 'assessments-course', sortOrder: 1, status: ContentStatus.PUBLISHED, publishedAt: now, accessType: AccessType.PUBLIC, createdById: admin.id, updatedById: admin.id },
    });
    courseId = course.id;

    const bank = await prisma.questionBank.create({ data: { subjectId, title: 'Assessments Bank', status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id } });
    questionBankId = bank.id;
    const source = await prisma.questionSource.create({ data: { type: QuestionSourceType.PLATFORM, titleAr: 'منصة', status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id } });
    sourceId = source.id;

    const created: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const question = await prisma.question.create({
        data: {
          bankId: bank.id,
          sourceId: source.id,
          courseId: course.id,
          type: QuestionType.SINGLE_CHOICE,
          body: `Question ${i}`,
          explanation: `Explanation ${i}`,
          status: QuestionStatus.PUBLISHED,
          publishedAt: now,
          reviewedAt: now,
          reviewedById: admin.id,
          createdById: admin.id,
          updatedById: admin.id,
          options: { create: [{ body: 'Correct', isCorrect: true, sortOrder: 1 }, { body: 'Wrong', isCorrect: false, sortOrder: 2 }] },
          placements: { create: [{ courseId: course.id }] },
        },
      });
      created.push(question.id);
    }
    questionIds = created;
  });

  afterAll(async () => {
    await app.close();
  });

  let studentAssessmentId: string;

  it('lets a student generate a standard assessment from a chosen scope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/student/assessments',
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { questionBankId, courseIds: [courseId], sourceIds: [sourceId], questionCount: 2, mode: 'EXAM' },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.questionCount).toBe(2);
    expect(body.visibility).toBe('MINE');
    expect(body.questionBankId).toBe(questionBankId);
    studentAssessmentId = body.id;
  });

  it('rejects generating more questions than exist in scope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/student/assessments',
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { questionBankId, courseIds: [courseId], questionCount: 50 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('keeps a student-generated assessment private to its owner', async () => {
    const ownList = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(ownList.statusCode).toBe(200);
    expect(JSON.parse(ownList.body).data.some((x: any) => x.id === studentAssessmentId)).toBe(true);

    const otherList = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(otherList.statusCode).toBe(200);
    expect(JSON.parse(otherList.body).data.some((x: any) => x.id === studentAssessmentId)).toBe(false);

    const forbidden = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${studentAssessmentId}`, headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(forbidden.statusCode).toBe(403);
  });

  it('runs the full attempt lifecycle: start, autosave, submit, result', async () => {
    const start = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(start.statusCode).toBe(201);
    const state = JSON.parse(start.body);
    expect(state.status).toBe('SUSPENDED');
    expect(state.questions).toHaveLength(2);

    const firstQuestion = state.questions[0];
    const correctOptionId = firstQuestion.options[0].id;
    const autosave = await app.inject({
      method: 'POST',
      url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/answers/${firstQuestion.id}`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { selectedOptionIds: [correctOptionId] },
    });
    expect(autosave.statusCode).toBe(201);
    // EXAM mode must not reveal correctness before submission.
    expect(JSON.parse(autosave.body).isCorrect).toBeNull();

    const current = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(current.statusCode).toBe(200);
    expect(JSON.parse(current.body).questions.find((q: any) => q.id === firstQuestion.id).answered).toBe(true);

    const activeTime = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/questions/${firstQuestion.id}/active-time`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { activeSeconds: 12 },
    });
    expect(activeTime.statusCode).toBe(200);
    expect(JSON.parse(activeTime.body).activeSeconds).toBe(12);

    const lowerActiveTime = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/questions/${firstQuestion.id}/active-time`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { activeSeconds: 8 },
    });
    expect(lowerActiveTime.statusCode).toBe(200);
    expect(JSON.parse(lowerActiveTime.body).activeSeconds).toBe(12);

    const concurrentActiveTimes = await Promise.all([20, 30].map((activeSeconds) => app.inject({
      method: 'PATCH',
      url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/questions/${firstQuestion.id}/active-time`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { activeSeconds },
    })));
    expect(concurrentActiveTimes.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(Math.max(...concurrentActiveTimes.map((response) => JSON.parse(response.body).activeSeconds))).toBe(30);

    const submit = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(submit.statusCode).toBe(201);
    expect(JSON.parse(submit.body).status).toBe('COMPLETED');

    const result = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/result`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(result.statusCode).toBe(200);
    const resultBody = JSON.parse(result.body);
    expect(resultBody.totalQuestions).toBe(2);
    expect(resultBody).toMatchObject({ percentage: 50, correctCount: 1, incorrectCount: 0, omittedCount: 1, answeredCount: 1 });
    expect(resultBody.comparison).toMatchObject({ status: 'NOT_APPLICABLE' });
    expect(resultBody.questions[0].activeSeconds).toBe(30);
    expect(resultBody.questions[0].explanation).toBeDefined();
    expect(resultBody.questions).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'CORRECT' }), expect.objectContaining({ outcome: 'OMITTED' })]));
    expect((await prisma.questionCommunityStat.aggregate({ where: { questionId: { in: questionIds } }, _sum: { totalResponses: true, correctResponses: true } }))._sum).toEqual({ totalResponses: 1, correctResponses: 1 });

    const resultWithoutComparison = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/result?includeComparison=false`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(resultWithoutComparison.statusCode).toBe(200);
    expect(JSON.parse(resultWithoutComparison.body).comparison).toBeUndefined();

    const analytics = await app.inject({ method: 'GET', url: '/api/v1/student/assessments/analytics/summary?q=Assessments%20Subject&page=1&limit=1', headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(analytics.statusCode).toBe(200);
    expect(JSON.parse(analytics.body)).toMatchObject({ level: 'subject', data: [expect.objectContaining({ id: subjectId, total: 2, correct: 1, omitted: 1 })] });
    expect(JSON.parse(analytics.body).meta).toEqual({ groups: { page: 1, limit: 1, total: 1, totalPages: 1 } });

    const resubmit = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${studentAssessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(resubmit.statusCode).toBe(201);
    expect(JSON.parse(resubmit.body).score).toBe(JSON.parse(submit.body).score);
  });

  it('discovers accessible bank/sources and applies a private mark filter', async () => {
    const banks = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/question-banks?subjectId=${subjectId}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(banks.statusCode).toBe(200);
    expect(JSON.parse(banks.body).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: questionBankId, availableQuestionCount: 3 })]));
    const sources = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/question-sources?questionBankId=${questionBankId}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(sources.statusCode).toBe(200);
    expect(JSON.parse(sources.body).data).toEqual(expect.arrayContaining([expect.objectContaining({ id: sourceId, type: 'PLATFORM' })]));
    const mark = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/question-marks/${questionIds[0]}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(mark.statusCode).toBe(201);
    const marks = await app.inject({ method: 'GET', url: '/api/v1/student/assessments/question-marks', headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(marks.statusCode).toBe(200);
    expect(JSON.parse(marks.body).data).toEqual(expect.arrayContaining([expect.objectContaining({ questionId: questionIds[0], bank: expect.objectContaining({ id: questionBankId }) })]));
    const generated = await app.inject({ method: 'POST', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student1.accessToken}` }, payload: { questionBankId, courseIds: [courseId], markedOnly: true, questionCount: 1 } });
    expect(generated.statusCode).toBe(201);
    const unmark = await app.inject({ method: 'DELETE', url: `/api/v1/student/assessments/question-marks/${questionIds[0]}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(unmark.statusCode).toBe(200);
  });

  it('atomically aggregates concurrent community responses', async () => {
    const stats = app.get(QuestionCommunityStatsService);
    const questionId = questionIds[2];
    await prisma.questionCommunityStat.deleteMany({ where: { questionId } });
    await Promise.all(Array.from({ length: 10 }, (_, index) => prisma.$transaction((tx) => stats.recordResponse(tx, questionId, index < 6))));
    const aggregate = await prisma.questionCommunityStat.findUniqueOrThrow({ where: { questionId } });
    expect(aggregate).toMatchObject({ totalResponses: 10, correctResponses: 6, incorrectResponses: 4, difficultyBand: 'D' });
    expect(aggregate.incorrectRate).toBeCloseTo(40);
  });

  it('lets the owner rename and then delete their assessment', async () => {
    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/assessments/${studentAssessmentId}`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { title: 'Renamed quiz' },
    });
    expect(rename.statusCode).toBe(200);
    expect(JSON.parse(rename.body).title).toBe('Renamed quiz');

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/v1/student/assessments/${studentAssessmentId}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(deleteResponse.statusCode).toBe(200);
    expect(JSON.parse(deleteResponse.body).deleted).toBe(true);
  });

  let adminAssessmentId: string;

  it('lets an admin build a custom quiz by hand-picking questions and publish it', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/custom',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { questionIds: [questionIds[0], questionIds[1]], scopes: [{ courseId }], mode: 'TUTOR' },
    });
    expect(create.statusCode).toBe(201);
    const created = JSON.parse(create.body);
    expect(created.status).toBe('DRAFT');
    adminAssessmentId = created.id;

    const notYetVisible = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(JSON.parse(notYetVisible.body).data.some((x: any) => x.id === adminAssessmentId)).toBe(false);

    const publish = await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${adminAssessmentId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(publish.statusCode).toBe(201);
    expect(JSON.parse(publish.body).status).toBe('READY');
  });

  it('makes a published admin assessment publicly visible and attemptable by any entitled student', async () => {
    for (const student of [student1, student2]) {
      const list = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student.accessToken}` } });
      const row = JSON.parse(list.body).data.find((x: any) => x.id === adminAssessmentId);
      expect(row).toBeDefined();
      expect(row.visibility).toBe('PUBLIC');
    }

    const start = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(start.statusCode).toBe(201);
    const state = JSON.parse(start.body);
    // TUTOR mode reveals correctness immediately after an answer is saved.
    const questionId = state.questions[0].id;
    const optionId = state.questions[0].options[0].id;
    const autosave = await app.inject({
      method: 'POST',
      url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/current/answers/${questionId}`,
      headers: { authorization: `Bearer ${student2.accessToken}` },
      payload: { selectedOptionIds: [optionId] },
    });
    expect(autosave.statusCode).toBe(201);
    expect(JSON.parse(autosave.body).isCorrect).not.toBeNull();

    const submit = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(submit.statusCode).toBe(201);
  });

  it('archives an admin assessment so it disappears from student lists but keeps existing attempts readable', async () => {
    const archive = await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${adminAssessmentId}/archive`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(archive.statusCode).toBe(201);
    expect(JSON.parse(archive.body).status).toBe('ARCHIVED');

    const list = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(JSON.parse(list.body).data.some((x: any) => x.id === adminAssessmentId)).toBe(false);

    // Student 2 already completed an attempt before the archive; that
    // attempt's state and result must remain readable.
    const current = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/current`, headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(current.statusCode).toBe(200);
    expect(JSON.parse(current.body).status).toBe('COMPLETED');

    const result = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/current/result`, headers: { authorization: `Bearer ${student2.accessToken}` } });
    expect(result.statusCode).toBe(200);

    // A student who never attempted it still can't start a new attempt on an archived assessment.
    const blockedStart = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${adminAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student1.accessToken}` } });
    expect(blockedStart.statusCode).toBe(403);
  });

  it('resumes an in-progress attempt after the assessment is archived, instead of 403ing', async () => {
    const student3 = await registerStudent(app, (await prisma.studentProfile.findUnique({ where: { userId: student1.userId } }))!.academicGradeId!, (await prisma.governorate.findFirst({ where: { nameAr: 'محافظة اختبار التقييمات' } }))!.id, '29902020233333', '01033334444');

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/standard',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    const resumeAssessmentId = JSON.parse(create.body).id;
    await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${resumeAssessmentId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });

    const firstStart = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${resumeAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student3.accessToken}` } });
    expect(firstStart.statusCode).toBe(201);
    const attemptId = JSON.parse(firstStart.body).attemptId;

    await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${resumeAssessmentId}/archive`, headers: { authorization: `Bearer ${adminToken}` } });

    const resumeStart = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${resumeAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student3.accessToken}` } });
    expect(resumeStart.statusCode).toBe(201);
    const resumed = JSON.parse(resumeStart.body);
    expect(resumed.attemptId).toBe(attemptId);
    expect(resumed.status).toBe('SUSPENDED');
  });

  it('handles two concurrent start requests without erroring, resolving to the same attempt', async () => {
    const student4 = await registerStudent(app, (await prisma.studentProfile.findUnique({ where: { userId: student1.userId } }))!.academicGradeId!, (await prisma.governorate.findFirst({ where: { nameAr: 'محافظة اختبار التقييمات' } }))!.id, '29902020244444', '01044445555');

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/standard',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    const raceAssessmentId = JSON.parse(create.body).id;
    await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${raceAssessmentId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/student/assessments/${raceAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student4.accessToken}` } }),
      app.inject({ method: 'POST', url: `/api/v1/student/assessments/${raceAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student4.accessToken}` } }),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(first.body).attemptId).toBe(JSON.parse(second.body).attemptId);
  });

  it('rejects a whitespace-only title when renaming a student assessment', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/student/assessments',
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    const blankTitleAssessmentId = JSON.parse(create.body).id;

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/assessments/${blankTitleAssessmentId}`,
      headers: { authorization: `Bearer ${student1.accessToken}` },
      payload: { title: '   ' },
    });
    expect(rename.statusCode).toBe(400);
  });

  it('rejects a whitespace-only title when updating an admin draft assessment', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/standard',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    const draftId = JSON.parse(create.body).id;

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/assessments/${draftId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { title: '   ' },
    });
    expect(update.statusCode).toBe(400);
  });

  it('rejects duplicate questionIds when building a custom assessment', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/custom',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { questionIds: [questionIds[0], questionIds[0]], scopes: [{ courseId }] },
    });
    expect(create.statusCode).toBe(400);
  });

  it('only allows deleting a never-published draft assessment', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/standard',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    expect(create.statusCode).toBe(201);
    const draftId = JSON.parse(create.body).id;

    const deleteDraft = await app.inject({ method: 'DELETE', url: `/api/v1/admin/assessments/${draftId}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(deleteDraft.statusCode).toBe(200);

    const publish = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assessments/standard',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { scopes: [{ courseId }], questionCount: 1 },
    });
    const publishedId = JSON.parse(publish.body).id;
    await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${publishedId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });
    const deletePublished = await app.inject({ method: 'DELETE', url: `/api/v1/admin/assessments/${publishedId}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(deletePublished.statusCode).toBe(409);
  });

  describe('multi-scope visibility requires entitlement to every scope', () => {
    let chapterAId: string;
    let chapterBId: string;
    let questionAId: string;
    let questionBId: string;
    let leakAssessmentId: string;

    beforeAll(async () => {
      const now = new Date();
      const gradeId = (await prisma.studentProfile.findUnique({ where: { userId: student1.userId } }))!.academicGradeId!;
      const admin = await prisma.user.findFirstOrThrow({ where: { loginIdentifier: superAdminEmail } });
      const sortOrder = (await prisma.subject.count({ where: { academicGradeId: gradeId } })) + 1;
      const subject = await prisma.subject.create({
        data: { academicGradeId: gradeId, title: 'Multi-Scope Subject', slug: 'multi-scope-subject', sortOrder, status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id },
      });
      const paidCourse = await prisma.course.create({
        data: { subjectId: subject.id, title: 'Paid Multi-Scope Course', slug: 'paid-multi-scope-course', sortOrder: 1, status: ContentStatus.PUBLISHED, publishedAt: now, accessType: AccessType.PAID, createdById: admin.id, updatedById: admin.id },
      });
      const chapterA = await prisma.chapter.create({
        data: { courseId: paidCourse.id, title: 'Chapter A', slug: 'chapter-a', sortOrder: 1, status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id },
      });
      const chapterB = await prisma.chapter.create({
        data: { courseId: paidCourse.id, title: 'Chapter B', slug: 'chapter-b', sortOrder: 2, status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id },
      });
      chapterAId = chapterA.id;
      chapterBId = chapterB.id;

      const bank = await prisma.questionBank.create({ data: { subjectId: subject.id, title: 'Multi-Scope Bank', status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id } });
      const source = await prisma.questionSource.create({ data: { type: QuestionSourceType.PLATFORM, titleAr: 'منصة 2', status: ContentStatus.PUBLISHED, publishedAt: now, createdById: admin.id, updatedById: admin.id } });

      const questionA = await prisma.question.create({
        data: {
          bankId: bank.id, sourceId: source.id, courseId: paidCourse.id, type: QuestionType.SINGLE_CHOICE,
          body: 'Chapter A question', explanation: 'Explanation A', status: QuestionStatus.PUBLISHED, publishedAt: now, reviewedAt: now, reviewedById: admin.id, createdById: admin.id, updatedById: admin.id,
          options: { create: [{ body: 'Correct', isCorrect: true, sortOrder: 1 }, { body: 'Wrong', isCorrect: false, sortOrder: 2 }] },
          placements: { create: [{ chapterId: chapterA.id }] },
        },
      });
      const questionB = await prisma.question.create({
        data: {
          bankId: bank.id, sourceId: source.id, courseId: paidCourse.id, type: QuestionType.SINGLE_CHOICE,
          body: 'Chapter B question', explanation: 'Explanation B', status: QuestionStatus.PUBLISHED, publishedAt: now, reviewedAt: now, reviewedById: admin.id, createdById: admin.id, updatedById: admin.id,
          options: { create: [{ body: 'Correct', isCorrect: true, sortOrder: 1 }, { body: 'Wrong', isCorrect: false, sortOrder: 2 }] },
          placements: { create: [{ chapterId: chapterB.id }] },
        },
      });
      questionAId = questionA.id;
      questionBId = questionB.id;

      // student1 is granted only chapter A; the paid course itself has no course-wide grant.
      const grantA = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/entitlements',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { studentUserId: student1.userId, chapterId: chapterAId },
      });
      expect(grantA.statusCode).toBe(201);

      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/assessments/custom',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { questionIds: [questionAId, questionBId], scopes: [{ chapterId: chapterAId }, { chapterId: chapterBId }] },
      });
      expect(create.statusCode).toBe(201);
      leakAssessmentId = JSON.parse(create.body).id;
      const publish = await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${leakAssessmentId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });
      expect(publish.statusCode).toBe(201);
    });

    it('hides the assessment entirely from a student entitled to only one of its two scopes', async () => {
      const list = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student1.accessToken}` } });
      expect(JSON.parse(list.body).data.some((x: any) => x.id === leakAssessmentId)).toBe(false);

      const start = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${leakAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student1.accessToken}` } });
      expect(start.statusCode).toBe(403);

      const direct = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${leakAssessmentId}`, headers: { authorization: `Bearer ${student1.accessToken}` } });
      expect(direct.statusCode).toBe(403);
    });

    it('becomes visible and attemptable once the student is entitled to every scope', async () => {
      const grantB = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/entitlements',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { studentUserId: student1.userId, chapterId: chapterBId },
      });
      expect(grantB.statusCode).toBe(201);

      const list = await app.inject({ method: 'GET', url: '/api/v1/student/assessments', headers: { authorization: `Bearer ${student1.accessToken}` } });
      expect(JSON.parse(list.body).data.some((x: any) => x.id === leakAssessmentId)).toBe(true);

      const start = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${leakAssessmentId}/attempts/start`, headers: { authorization: `Bearer ${student1.accessToken}` } });
      expect(start.statusCode).toBe(201);
      expect(JSON.parse(start.body).questions).toHaveLength(2);
    });
  });

  describe('autosave/submit race safety', () => {
    let student5: { accessToken: string; userId: string };

    beforeAll(async () => {
      student5 = await registerStudent(app, (await prisma.studentProfile.findUnique({ where: { userId: student1.userId } }))!.academicGradeId!, (await prisma.governorate.findFirst({ where: { nameAr: 'محافظة اختبار التقييمات' } }))!.id, '29902020255555', '01055556666');
    });

    async function freshStartedAssessment(studentToken: string) {
      const create = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/assessments/standard',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { scopes: [{ courseId }], questionCount: 1 },
      });
      const assessmentId = JSON.parse(create.body).id;
      await app.inject({ method: 'POST', url: `/api/v1/admin/assessments/${assessmentId}/publish`, headers: { authorization: `Bearer ${adminToken}` } });
      const start = await app.inject({ method: 'POST', url: `/api/v1/student/assessments/${assessmentId}/attempts/start`, headers: { authorization: `Bearer ${studentToken}` } });
      const state = JSON.parse(start.body);
      return { assessmentId, questionId: state.questions[0].id, optionId: state.questions[0].options[0].id };
    }

    it('never lets a concurrent autosave report success while missing from the submitted result', async () => {
      for (let i = 0; i < 8; i++) {
        const { assessmentId, questionId, optionId } = await freshStartedAssessment(student5.accessToken);

        const [autosave, submit] = await Promise.all([
          app.inject({
            method: 'POST',
            url: `/api/v1/student/assessments/${assessmentId}/attempts/current/answers/${questionId}`,
            headers: { authorization: `Bearer ${student5.accessToken}` },
            payload: { selectedOptionIds: [optionId] },
          }),
          app.inject({ method: 'POST', url: `/api/v1/student/assessments/${assessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student5.accessToken}` } }),
        ]);

        expect(submit.statusCode).toBe(201);
        expect([201, 409]).toContain(autosave.statusCode);

        const result = await app.inject({ method: 'GET', url: `/api/v1/student/assessments/${assessmentId}/attempts/current/result`, headers: { authorization: `Bearer ${student5.accessToken}` } });
        expect(result.statusCode).toBe(200);
        const answered = JSON.parse(result.body).questions[0].answered;

        if (autosave.statusCode === 201) expect(answered).toBe(true);
      }
    });

    it('two fully concurrent submits agree on the same score and submittedAt', async () => {
      const { assessmentId, questionId, optionId } = await freshStartedAssessment(student5.accessToken);
      await app.inject({
        method: 'POST',
        url: `/api/v1/student/assessments/${assessmentId}/attempts/current/answers/${questionId}`,
        headers: { authorization: `Bearer ${student5.accessToken}` },
        payload: { selectedOptionIds: [optionId] },
      });

      const [first, second] = await Promise.all([
        app.inject({ method: 'POST', url: `/api/v1/student/assessments/${assessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student5.accessToken}` } }),
        app.inject({ method: 'POST', url: `/api/v1/student/assessments/${assessmentId}/attempts/current/submit`, headers: { authorization: `Bearer ${student5.accessToken}` } }),
      ]);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const firstBody = JSON.parse(first.body);
      const secondBody = JSON.parse(second.body);
      expect(firstBody.score).toBe(secondBody.score);
      expect(firstBody.submittedAt).toBe(secondBody.submittedAt);
    });
  });
});
