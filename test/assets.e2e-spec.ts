/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- e2e tests parse raw JSON bodies and stub provider internals */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { BunnyStorageProvider } from '../src/modules/assets/bunny-storage.provider';

const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
// A minimal ZIP local-file header (PK\x03\x04) — the container signature every OOXML file starts with.
const DOCX_BYTES = Buffer.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
]);
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function multipart(
  fileBuffer: Buffer,
  filename: string,
  mimetype: string,
): { body: Buffer; contentType: string; fileBuffer: Buffer; filename: string; mimetype: string } {
  const boundary = `----eduTestBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimetype}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, fileBuffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`, fileBuffer, filename, mimetype,
  };
}

describe('Assets (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let studentToken: string;
  let inspectSpy: jest.SpyInstance;
  let deleteSpy: jest.SpyInstance;

  const json = (response: { body: string }) => JSON.parse(response.body);
  const admin = () => ({ authorization: `Bearer ${adminToken}` });

  const upload = async (
    kind: string,
    file: { body: Buffer; contentType: string; fileBuffer: Buffer; filename: string; mimetype: string },
    headers: Record<string, string> = admin(),
  ) => {
    const authorization = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/assets/upload?kind=${kind}`,
      headers: { ...headers, 'content-type': file.contentType },
      payload: file.body,
    });
    if (authorization.statusCode !== 201) return authorization;
    inspectSpy.mockResolvedValueOnce({ sizeBytes: file.fileBuffer.length, mimeType: file.mimetype, first: file.fileBuffer.subarray(0, 16) });
    return app.inject({ method: 'POST', url: `/api/v1/admin/assets/${json(authorization).asset.id}/complete`, headers });
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);

    // Never touch real Bunny Storage: drain the stream and report success.
    jest.spyOn(BunnyStorageProvider.prototype, 'createUploadUrl').mockResolvedValue('https://bunny.example.test/presigned');
    inspectSpy = jest.spyOn(BunnyStorageProvider.prototype, 'inspect');
    deleteSpy = jest
      .spyOn(BunnyStorageProvider.prototype, 'delete')
      .mockResolvedValue(undefined);

    await seedSuperAdmin(app, 'assets-sa@example.com', 'SuperAdminP@ss1!');
    adminToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/admins/login',
        payload: {
          email: 'assets-sa@example.com',
          password: 'SuperAdminP@ss1!',
        },
      }),
    ).accessToken;

    const gradeId = (await seedPublishedAcademicGrade(app, 'assets-grade')).id;
    studentToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: 'Assets Student',
          nationalId: '29901010112345',
          phone: '01099990000',
          parentPhone: '01088880000',
          governorate: 'Cairo',
          password: 'StudentP@ss1!',
          academicGradeId: gradeId,
        },
      }),
    ).accessToken;
  });

  afterAll(async () => {
    inspectSpy.mockRestore();
    deleteSpy.mockRestore();
    await app.close();
  });

  describe('admin-only access', () => {
    it('rejects an unauthenticated upload', async () => {
      const response = await upload(
        'PDF',
        multipart(PDF_BYTES, 'a.pdf', 'application/pdf'),
        {},
      );
      expect(response.statusCode).toBe(401);
    });

    it('rejects a student upload', async () => {
      const response = await upload(
        'PDF',
        multipart(PDF_BYTES, 'a.pdf', 'application/pdf'),
        {
          authorization: `Bearer ${studentToken}`,
        },
      );
      expect(response.statusCode).toBe(403);
    });
  });

  describe('upload', () => {
    it('accepts a valid PDF and never exposes storage internals', async () => {
      const response = await upload(
        'PDF',
        multipart(PDF_BYTES, 'lesson.pdf', 'application/pdf'),
      );
      expect(response.statusCode).toBe(201);
      const body = json(response);
      expect(body).toMatchObject({ kind: 'PDF', status: 'READY' });
      expect(body).not.toHaveProperty('storageKey');
      expect(response.body).not.toContain('assets/pdf/');
    });

    it('rejects an unsupported MIME type', async () => {
      const response = await upload(
        'PDF',
        multipart(PNG_BYTES, 'a.png', 'image/png'),
      );
      expect(response.statusCode).toBe(400);
    });

    it('rejects an empty file', async () => {
      const response = await upload(
        'PDF',
        multipart(Buffer.alloc(0), 'empty.pdf', 'application/pdf'),
      );
      expect(response.statusCode).toBe(400);
    });

    it('rejects a file larger than the configured limit', async () => {
      const big = Buffer.concat([PNG_BYTES, Buffer.alloc(4096)]);
      const response = await upload(
        'IMAGE',
        multipart(big, 'big.png', 'image/png'),
      );
      expect(response.statusCode).toBe(400);
    });

    it('rejects a spoofed magic signature', async () => {
      const notPng = Buffer.from('this is plainly not a png');
      const response = await upload(
        'IMAGE',
        multipart(notPng, 'fake.png', 'image/png'),
      );
      expect(response.statusCode).toBe(400);
    });

    it('accepts a valid docx with a matching extension and ZIP signature', async () => {
      const response = await upload(
        'DOCUMENT',
        multipart(DOCX_BYTES, 'notes.docx', DOCX_MIME),
      );
      expect(response.statusCode).toBe(201);
      expect(json(response)).toMatchObject({
        kind: 'DOCUMENT',
        status: 'READY',
      });
    });

    it('rejects a docx whose filename extension does not match the declared type', async () => {
      const response = await upload(
        'DOCUMENT',
        multipart(DOCX_BYTES, 'notes.pdf', DOCX_MIME),
      );
      expect(response.statusCode).toBe(400);
    });

    it('rejects a docx MIME with a non-ZIP signature', async () => {
      const notZip = Buffer.from('this is not a zip container at all');
      const response = await upload(
        'DOCUMENT',
        multipart(notZip, 'notes.docx', DOCX_MIME),
      );
      expect(response.statusCode).toBe(400);
    });

    it('rejects an unknown asset kind', async () => {
      const response = await upload(
        'BOGUS',
        multipart(PDF_BYTES, 'a.pdf', 'application/pdf'),
      );
      expect(response.statusCode).toBe(400);
    });

    it('records a provider failure as a FAILED asset', async () => {
      inspectSpy.mockRejectedValueOnce(new Error('bunny outage'));
      const response = await upload(
        'PDF',
        multipart(PDF_BYTES, 'boom.pdf', 'application/pdf'),
      );
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      const prisma = app.get(PrismaService);
      const failed = await prisma.asset.findFirst({
        where: { originalFilename: 'boom.pdf' },
      });
      expect(failed?.status).toBe('FAILED');
    });
  });

  describe('reference protection & delivery', () => {
    it('blocks archiving a referenced asset, then delivers a short-lived protected URL', async () => {
      // Publish a full hierarchy so delivery ancestry is all PUBLISHED.
      const gradeId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/academic-grades',
          headers: admin(),
          payload: { title: 'Delivery Grade' },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-grades/${gradeId}/publish`,
        headers: admin(),
      });
      const subjectId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/subjects',
          headers: admin(),
          payload: { title: 'Delivery Subject', academicGradeId: gradeId },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/publish`,
        headers: admin(),
      });
      const courseId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/courses',
          headers: admin(),
          payload: {
            title: 'Delivery Course',
            subjectId,
            accessType: 'PUBLIC',
          },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/courses/${courseId}/publish`,
        headers: admin(),
      });

      // Upload a PDF and attach it as a content item's primary asset.
      const assetId = json(
        await upload(
          'PDF',
          multipart(PDF_BYTES, 'delivery.pdf', 'application/pdf'),
        ),
      ).id;
      const contentId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/content-items',
          headers: admin(),
          payload: { type: 'PDF', title: 'A PDF', placement: { courseId } },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId },
      });

      // Referenced asset cannot be archived.
      const archive = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/assets/${assetId}/archive`,
        headers: admin(),
      });
      expect(archive.statusCode).toBe(409);

      // Make the content item PUBLIC and publish it, then request protected access.
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/content-items/${contentId}/access`,
        headers: admin(),
        payload: { accessType: 'PUBLIC' },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/publish`,
        headers: admin(),
      });

      const access = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/content-items/${contentId}/assets/${assetId}/access`,
      });
      expect(access.statusCode).toBe(200);
      const body = json(access);
      // Token-authenticated, short-lived URL. (The CDN path legitimately contains the
      // object key; access is guarded by the token + expiry, not by hiding the path.)
      expect(body.url).toMatch(/token=.+expires=\d+/);
      expect(body.expiresAt).toBeDefined();
    });

    it('denies protected access when the asset is not attached to the content item', async () => {
      const strayAsset = json(
        await upload(
          'PDF',
          multipart(PDF_BYTES, 'stray.pdf', 'application/pdf'),
        ),
      ).id;
      const anyContent = await app.get(PrismaService).contentItem.findFirst();
      const access = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/content-items/${anyContent!.id}/assets/${strayAsset}/access`,
      });
      expect(access.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('delete unused drafts', () => {
    it('hard-deletes an unreferenced asset', async () => {
      const assetId = json(
        await upload(
          'PDF',
          multipart(PDF_BYTES, 'unused.pdf', 'application/pdf'),
        ),
      ).id;
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/assets/${assetId}`,
        headers: admin(),
      });
      expect(del.statusCode).toBe(200);
      const gone = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/assets/${assetId}`,
        headers: admin(),
      });
      expect(gone.statusCode).toBe(404);
      const row = await app
        .get(PrismaService)
        .asset.findUnique({ where: { id: assetId } });
      expect(row).toBeNull();
    });

    it('refuses to delete a referenced asset', async () => {
      // Reuse a course from the delivery suite: create a fresh published course + content item.
      const gradeId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/academic-grades',
          headers: admin(),
          payload: { title: 'Del Grade' },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-grades/${gradeId}/publish`,
        headers: admin(),
      });
      const subjectId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/subjects',
          headers: admin(),
          payload: { title: 'Del Subject', academicGradeId: gradeId },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/publish`,
        headers: admin(),
      });
      const courseId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/courses',
          headers: admin(),
          payload: { title: 'Del Course', subjectId, accessType: 'PUBLIC' },
        }),
      ).id;

      const assetId = json(
        await upload(
          'PDF',
          multipart(PDF_BYTES, 'referenced.pdf', 'application/pdf'),
        ),
      ).id;
      const contentId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/content-items',
          headers: admin(),
          payload: { type: 'PDF', title: 'Ref PDF', placement: { courseId } },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId },
      });

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/assets/${assetId}`,
        headers: admin(),
      });
      expect(del.statusCode).toBe(409);
    });
  });

  describe('replace primary asset', () => {
    it('archives the displaced asset once it is no longer referenced', async () => {
      const gradeId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/academic-grades',
          headers: admin(),
          payload: { title: 'Rep Grade' },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-grades/${gradeId}/publish`,
        headers: admin(),
      });
      const subjectId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/subjects',
          headers: admin(),
          payload: { title: 'Rep Subject', academicGradeId: gradeId },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/publish`,
        headers: admin(),
      });
      const courseId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/courses',
          headers: admin(),
          payload: { title: 'Rep Course', subjectId, accessType: 'PUBLIC' },
        }),
      ).id;

      const assetA = json(
        await upload('PDF', multipart(PDF_BYTES, 'a.pdf', 'application/pdf')),
      ).id;
      const assetB = json(
        await upload('PDF', multipart(PDF_BYTES, 'b.pdf', 'application/pdf')),
      ).id;
      const contentId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/content-items',
          headers: admin(),
          payload: { type: 'PDF', title: 'Rep PDF', placement: { courseId } },
        }),
      ).id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId: assetA },
      });
      // Replace A with B: A becomes unreferenced and is archived; B is now primary.
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId: assetB },
      });

      const prisma = app.get(PrismaService);
      const a = await prisma.asset.findUnique({ where: { id: assetA } });
      const b = await prisma.asset.findUnique({ where: { id: assetB } });
      expect(a?.status).toBe('ARCHIVED');
      expect(b?.status).toBe('READY');
    });
  });
});
