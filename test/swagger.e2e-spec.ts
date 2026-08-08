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

    const contentItemSchema = document.components.schemas.ContentItemSummaryDto;
    expect(contentItemSchema.properties.textBody).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(contentItemSchema.properties.externalUrl).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(
      document.components.schemas.LocalizedDescriptionDto.properties,
    ).toEqual(
      expect.objectContaining({
        ar: expect.objectContaining({ type: 'string', nullable: true }),
        en: expect.objectContaining({ type: 'string', nullable: true }),
      }),
    );
    expect(
      document.components.schemas.CatalogNodeDto.properties.description,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.CatalogNodeDto.properties.coverAssetId,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.CatalogContentItemDto.properties
        .estimatedDuration,
    ).toMatchObject({ type: 'number', nullable: true });
    expect(
      document.components.schemas.StudentEntitlementDto.properties.targetId,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.StudentEntitlementDto.properties.expiresAt,
    ).toMatchObject({
      type: 'string',
      format: 'date-time',
      nullable: true,
    });
    expect(
      document.components.schemas.ContentPlacementSummaryDto.properties
        .courseId,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.AssessmentScopeResponseDto.properties
        .chapterId,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.PartnerSummaryDto.properties.displayName,
    ).toMatchObject({ type: 'string', nullable: true });
    expect(
      document.components.schemas.PartnerSummaryDto.properties.phone,
    ).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(
      document.paths['/api/v1/admin/assets/covers/{resource}/{id}'].delete
        .summary,
    ).toBe('Remove a hierarchy record cover image');

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
        expect.objectContaining({ name: 'q', in: 'query' }),
        expect.objectContaining({ name: 'subjectId', in: 'query' }),
      ]),
    );
    expect(document.paths['/api/v1/admin/assets'].get.parameters).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'q', in: 'query' })]),
    );

    expect(document.paths['/api/v1/student/my-subjects'].get.summary).toBe(
      'List subjects with active course or chapter access and calculated progress',
    );
    expect(
      document.paths['/api/v1/student/catalog/search'].get.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'subjectId', in: 'query' }),
        expect.objectContaining({ name: 'q', in: 'query' }),
        expect.objectContaining({ name: 'types', in: 'query' }),
      ]),
    );
    // `q` is mandatory here: the handler dereferences it directly, so an
    // optional `q` inherited from the shared cursor DTO would 500 rather than
    // 400. See src/common/dto/cursor-pagination-query.dto.ts.
    expect(
      document.paths['/api/v1/student/catalog/search'].get.parameters.find(
        (parameter: { name: string }) => parameter.name === 'q',
      ),
    ).toMatchObject({ required: true });

    // Every StudentCatalogController operation documents a real response
    // schema. Other student controllers still have gaps; this guard covers the
    // surface that has been documented so it cannot silently regress.
    const studentCatalogPaths = Object.entries(
      document.paths as Record<string, Record<string, any>>,
    ).filter(
      ([path]) =>
        path.startsWith('/api/v1/student/catalog') ||
        ['/api/v1/student/library', '/api/v1/student/my-subjects', '/api/v1/student/entitlements'].includes(path),
    );
    expect(studentCatalogPaths).not.toHaveLength(0);
    const undocumentedCatalogOps = studentCatalogPaths.flatMap(([path, operations]) =>
      Object.entries(operations)
        .filter(([method]) => method === 'get')
        .filter(([, operation]) => {
          const ok = operation.responses['200'] ?? operation.responses['201'];
          return !ok?.content?.['application/json']?.schema?.$ref;
        })
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(undocumentedCatalogOps).toEqual([]);

    expect(
      document.paths['/api/v1/geography/governorates'].get.responses['200']
        .content['application/json'].schema,
    ).toMatchObject({ $ref: '#/components/schemas/PaginatedGovernorateResponseDto' });
    expect(
      document.paths['/api/v1/student/content-items/{id}/study-state'].put
        .requestBody.content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/UpdateContentStudyStateDto',
    });
    expect(
      document.components.schemas.UpdateContentStudyStateDto.properties
        .playbackPositionSeconds,
    ).toMatchObject({ type: 'number', nullable: true, minimum: 0 });
    expect(
      document.paths['/api/v1/student/learning/continue'].get.summary,
    ).toBe('Get the most recently studied accessible content item');

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

    const paymentMethods =
      document.paths['/api/v1/admin/manual-payment-methods'].get;
    expect(paymentMethods.summary).toBe('List all manual payment methods');
    expect(
      paymentMethods.responses[200].content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/PaginatedManualPaymentMethodsResponseDto',
    });

    const updatePaymentMethod =
      document.paths['/api/v1/admin/manual-payment-methods/{id}'].patch;
    expect(
      updatePaymentMethod.requestBody.content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/UpdatePaymentMethodDto',
    });
    expect(
      document.components.schemas.UpdatePaymentMethodDto.properties,
    ).toEqual(
      expect.objectContaining({
        titleAr: expect.any(Object),
        instructionsAr: expect.any(Object),
        titleEn: expect.objectContaining({ nullable: true }),
        instructionsEn: expect.objectContaining({ nullable: true }),
        isActive: expect.any(Object),
      }),
    );
    expect(
      updatePaymentMethod.responses[200].content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/ManualPaymentMethodDto',
    });
    expect(
      document.components.schemas.ManualPaymentMethodDto.properties,
    ).toEqual(
      expect.objectContaining({
        titleEn: expect.objectContaining({ type: 'string', nullable: true }),
        instructionsEn: expect.objectContaining({
          type: 'string',
          nullable: true,
        }),
      }),
    );
    expect(
      document.components.schemas.PaymentMethodSnapshotDto.properties,
    ).toEqual(
      expect.objectContaining({
        titleEn: expect.objectContaining({ type: 'string', nullable: true }),
        instructionsEn: expect.objectContaining({
          type: 'string',
          nullable: true,
        }),
      }),
    );
    expect(
      document.components.schemas.PaymentSubmissionSummaryDto.properties,
    ).toEqual(
      expect.objectContaining({
        transactionReference: expect.objectContaining({
          type: 'string',
          nullable: true,
        }),
        note: expect.objectContaining({ type: 'string', nullable: true }),
        rejectionReason: expect.objectContaining({
          type: 'string',
          nullable: true,
        }),
      }),
    );
    expect(
      document.components.schemas.PaymentSubmissionDetailDto.required,
    ).toEqual(expect.arrayContaining(['createdAt', 'reviewedAt']));
    expect(
      document.components.schemas.CourseSummaryDto.properties.description,
    ).toMatchObject({
      type: 'string',
      nullable: true,
    });

    const reorderPaymentMethods =
      document.paths['/api/v1/admin/manual-payment-methods/reorder'].post;
    expect(
      reorderPaymentMethods.requestBody.content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/ReorderPaymentMethodsDto',
    });
    expect(
      document.components.schemas.ReorderPaymentMethodsDto.properties.methodIds,
    ).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });

    const proofUpload =
      document.paths['/api/v1/student/orders/{id}/payment-proof'].post;
    expect(
      proofUpload.requestBody.content['multipart/form-data'].schema,
    ).toMatchObject({
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    });
    expect(
      proofUpload.responses[201].content['application/json'].schema,
    ).toMatchObject({
      $ref: '#/components/schemas/PaymentProofUploadAuthorizationResponseDto',
    });

    const hasDocumentedShape = (
      schema: Record<string, unknown> | undefined,
      seen = new Set<string>(),
    ): boolean => {
      if (!schema) return false;
      const ref = schema.$ref;
      if (typeof ref === 'string') {
        const name = ref.split('/').at(-1);
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return hasDocumentedShape(document.components.schemas[name], seen);
      }
      const properties = schema.properties;
      if (
        properties &&
        typeof properties === 'object' &&
        Object.keys(properties).length
      )
        return true;
      return ['allOf', 'oneOf', 'anyOf'].some((key) => {
        const variants = schema[key];
        return (
          Array.isArray(variants) &&
          variants.some((item) =>
            hasDocumentedShape(item as Record<string, unknown>, new Set(seen)),
          )
        );
      });
    };

    const emptyRequestSchemas: string[] = [];
    for (const [pathName, path] of Object.entries(document.paths) as Array<
      [
        string,
        Record<
          string,
          {
            requestBody?: {
              content?: Record<string, { schema?: Record<string, unknown> }>;
            };
          }
        >,
      ]
    >) {
      for (const method of ['post', 'put', 'patch']) {
        const requestBody = path[method]?.requestBody;
        if (!requestBody) continue;
        const schemas = Object.values(requestBody.content ?? {}).map(
          (content) => content.schema,
        );
        if (
          !schemas.length ||
          schemas.some((schema) => !hasDocumentedShape(schema))
        )
          emptyRequestSchemas.push(`${method.toUpperCase()} ${pathName}`);
      }
    }
    expect(emptyRequestSchemas).toEqual([]);

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
