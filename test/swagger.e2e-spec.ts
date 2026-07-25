/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Swagger output is dynamic JSON */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory';

describe('Swagger (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ enableSwagger: true, enableLogging: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents paginated collections and shared auth cookie flows', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);

    expect(document.components.securitySchemes.refresh_token).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
    });
    expect(document.paths['/api/v1/admin/admins'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
      ]),
    );

    const studentRegistrationSchema =
      document.components.schemas.RegisterStudentDto;
    expect(studentRegistrationSchema.properties.academicGradeId).toMatchObject({
      type: 'string',
      description: 'ID of the academic grade the student is enrolled in',
    });
    expect(studentRegistrationSchema.required).toContain('academicGradeId');

    const publicGrades = document.paths['/api/v1/academic-grades'].get;
    expect(publicGrades.summary).toBe('List published academic grades');
    expect(publicGrades.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
      ]),
    );

    const catalogSubjects = document.paths['/api/v1/catalog/subjects'].get;
    expect(catalogSubjects.summary).toBe('List published catalog subjects');
    expect(catalogSubjects.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
        expect.objectContaining({ name: 'academicGradeId', in: 'query' }),
      ]),
    );

    const catalogCourses = document.paths['/api/v1/catalog/courses'].get;
    expect(catalogCourses.summary).toBe('List published catalog courses');
    expect(catalogCourses.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
        expect.objectContaining({ name: 'subjectId', in: 'query' }),
      ]),
    );

    const refresh = document.paths['/api/v1/auth/refresh'].post;
    expect(refresh.summary).toBe('Refresh user access token');
    expect(refresh.security).toEqual([{ refresh_token: [] }]);
    expect(refresh.responses).toMatchObject({
      201: expect.objectContaining({
        headers: expect.objectContaining({ 'Set-Cookie': expect.any(Object) }),
      }),
      401: expect.any(Object),
      429: expect.any(Object),
    });

    const httpMethods = new Set([
      'get',
      'put',
      'post',
      'delete',
      'options',
      'head',
      'patch',
      'trace',
    ]);
    const undocumented: string[] = [];
    for (const [pathName, path] of Object.entries(document.paths) as Array<
      [string, Record<string, { summary?: string }>]
    >) {
      for (const [method, operation] of Object.entries(path)) {
        if (
          httpMethods.has(method) &&
          typeof operation === 'object' &&
          operation !== null
        ) {
          if (!operation.summary)
            undocumented.push(`${method.toUpperCase()} ${pathName}`);
        }
      }
    }
    expect(undocumented).toEqual([]);
  });
});
