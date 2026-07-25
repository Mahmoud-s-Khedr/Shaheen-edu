/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';

describe('Content items (e2e)', () => {
  let app: NestFastifyApplication;
  let token: string;
  let studentToken: string;
  let courseId: string;
  let chapterId: string;
  let initialContent: { id: string };

  const json = (response: { body: string }) => JSON.parse(response.body);
  const auth = () => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    await seedSuperAdmin(app, 'content-sa@example.com', 'SuperAdminP@ss1!');
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'content-sa@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    token = json(login).accessToken;
    const grade = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-grades',
      headers: auth(),
      payload: { title: 'Content Grade' },
    });
    const subject = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/subjects',
      headers: auth(),
      payload: { title: 'Content Subject', academicGradeId: json(grade).id },
    });
    const course = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/courses',
      headers: auth(),
      payload: {
        title: 'Content Course',
        subjectId: json(subject).id,
        accessType: 'PUBLIC',
      },
    });
    courseId = json(course).id;
    const chapter = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/chapters',
      headers: auth(),
      payload: { title: 'Content Chapter', courseId },
    });
    chapterId = json(chapter).id;

    const studentGradeId = (
      await seedPublishedAcademicGrade(app, 'content-student-grade')
    ).id;
    studentToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: 'Content Student',
          nationalId: '29901010154321',
          phone: '01099991111',
          parentPhone: '01088881111',
          governorate: 'Cairo',
          password: 'StudentP@ss1!',
          academicGradeId: studentGradeId,
        },
      }),
    ).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and validates text and external-link content', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: { type: 'TEXT', title: 'Empty', placement: { courseId } },
    });
    expect(invalid.statusCode).toBe(400);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'TEXT',
        title: 'Welcome',
        textBody: 'Read this first.',
        placement: { courseId },
      },
    });
    expect(created.statusCode).toBe(201);
    initialContent = json(created);
    expect(initialContent).toMatchObject({
      type: 'TEXT',
      status: 'DRAFT',
      placement: { courseId, sortOrder: 1 },
    });
    const insecure = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'EXTERNAL_LINK',
        title: 'Insecure',
        externalUrl: 'http://example.com',
        placement: { courseId },
      },
    });
    expect(insecure.statusCode).toBe(400);
    const multiple = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'TEXT',
        title: 'Bad placement',
        textBody: 'Body',
        placement: { courseId, chapterId },
      },
    });
    expect(multiple.statusCode).toBe(400);
  });

  it('moves, atomically reorders, and hides archived items from normal lists', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'TEXT',
        title: 'First',
        textBody: 'One',
        placement: { courseId },
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'TEXT',
        title: 'Second',
        textBody: 'Two',
        placement: { courseId },
      },
    });
    const firstBody = json(first);
    const secondBody = json(second);
    const reorder = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items/reorder',
      headers: auth(),
      payload: {
        placement: { courseId },
        items: [
          { id: initialContent.id, sortOrder: 3 },
          { id: firstBody.id, sortOrder: 2 },
          { id: secondBody.id, sortOrder: 1 },
        ],
      },
    });
    expect(reorder.statusCode).toBe(201);
    const moved = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/content-items/${firstBody.id}/move`,
      headers: auth(),
      payload: {
        placement: { chapterId },
      },
    });
    expect(moved.statusCode).toBe(201);
    expect(json(moved).placement.chapterId).toBe(chapterId);
    const archived = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/content-items/${secondBody.id}/archive`,
      headers: auth(),
      payload: { version: secondBody.version },
    });
    expect(archived.statusCode).toBe(201);
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/content-items?courseId=${courseId}`,
      headers: auth(),
    });
    expect(
      json(list).data.some((item: { id: string }) => item.id === secondBody.id),
    ).toBe(false);
  });

  it('refuses to publish an archived content item', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/content-items',
      headers: auth(),
      payload: {
        type: 'TEXT',
        title: 'Retired',
        textBody: 'Old body',
        placement: { chapterId },
      },
    });
    const id = json(created).id;
    const archived = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/content-items/${id}/archive`,
      headers: auth(),
    });
    expect(archived.statusCode).toBe(201);

    const published = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/content-items/${id}/publish`,
      headers: auth(),
    });
    expect(published.statusCode).toBe(409);
    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/content-items/${id}`,
      headers: auth(),
    });
    expect(json(after).status).toBe('ARCHIVED');
  });

  describe('role protection', () => {
    const student = () => ({ authorization: `Bearer ${studentToken}` });

    // Every admin content route, exercised as a student (403) and unauthenticated
    // (401). Authorization must be decided before any DTO validation or lookup.
    type Route = { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string };
    const routes = (): Route[] => {
      const item = `/api/v1/admin/content-items/${initialContent.id}`;
      return [
        { method: 'GET', url: '/api/v1/admin/content-items' },
        { method: 'GET', url: item },
        { method: 'POST', url: '/api/v1/admin/content-items' },
        { method: 'POST', url: '/api/v1/admin/content-items/reorder' },
        { method: 'PATCH', url: item },
        { method: 'PATCH', url: `${item}/access` },
        { method: 'POST', url: `${item}/move` },
        { method: 'POST', url: `${item}/publish` },
        { method: 'POST', url: `${item}/archive` },
        { method: 'POST', url: `${item}/restore` },
        { method: 'POST', url: `${item}/primary-asset` },
        { method: 'POST', url: `${item}/attachments` },
        { method: 'POST', url: `${item}/attachments/reorder` },
        { method: 'DELETE', url: `${item}/attachments/missing-asset` },
        { method: 'DELETE', url: item },
      ];
    };

    const call = (route: Route, headers: Record<string, string>) =>
      app.inject(
        route.method === 'GET' || route.method === 'DELETE'
          ? { ...route, headers }
          : { ...route, headers, payload: {} },
      );

    it('rejects every admin content route for a student (403)', async () => {
      for (const route of routes()) {
        const response = await call(route, student());
        expect([route.method, route.url, response.statusCode]).toEqual([
          route.method,
          route.url,
          403,
        ]);
      }
    });

    it('rejects every admin content route when unauthenticated (401)', async () => {
      for (const route of routes()) {
        const response = await call(route, {});
        expect([route.method, route.url, response.statusCode]).toEqual([
          route.method,
          route.url,
          401,
        ]);
      }
    });
  });
});
