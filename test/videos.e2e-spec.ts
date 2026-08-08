/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- e2e tests parse raw JSON bodies and stub provider internals */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac } from 'node:crypto';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';

const READ_ONLY_KEY = process.env.BUNNY_STREAM_READ_ONLY_KEY as string;

function signedWebhook(payload: object) {
  const raw = JSON.stringify(payload);
  const signature = createHmac('sha256', READ_ONLY_KEY)
    .update(raw, 'utf8')
    .digest('hex');
  return {
    raw,
    headers: {
      'content-type': 'application/json',
      'x-bunnystream-signature': signature,
      'x-bunnystream-signature-version': 'v1',
      'x-bunnystream-signature-algorithm': 'hmac-sha256',
    },
  };
}

describe('Video assets (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let studentToken: string;
  let fetchSpy: jest.SpyInstance;
  let bunnyCounter = 0;

  const json = (response: { body: string }) => JSON.parse(response.body);
  const admin = () => ({ authorization: `Bearer ${adminToken}` });

  const postWebhook = (payload: object) => {
    const { raw, headers } = signedWebhook(payload);
    return app.inject({
      method: 'POST',
      url: '/api/v1/integrations/bunny-stream/webhook',
      headers,
      payload: raw,
    });
  };

  const bunnyIdFor = async (assetId: string) =>
    (await app
      .get(PrismaService)
      .videoAsset.findUnique({ where: { assetId } }))!.bunnyVideoId;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);

    // Never call real Bunny Stream: fake the create-video HTTP call.
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ guid: `bunny-${++bunnyCounter}` }), {
          status: 200,
        }),
    );

    await seedSuperAdmin(app, 'videos-sa@example.com', 'SuperAdminP@ss1!');
    adminToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/admins/login',
        payload: {
          email: 'videos-sa@example.com',
          password: 'SuperAdminP@ss1!',
        },
      }),
    ).accessToken;

    const gradeId = (await seedPublishedAcademicGrade(app, 'videos-grade')).id;
    studentToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: 'Videos Student',
          nationalId: '29903030312345',
          phone: '01099991111',
          parentPhone: '01088881111',
          governorate: 'Cairo',
          password: 'StudentP@ss1!',
          academicGradeId: gradeId,
        },
      }),
    ).accessToken;
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await app.close();
  });

  describe('admin-only access', () => {
    it('rejects an unauthenticated create', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/video-assets',
        payload: { title: 'x' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a student create', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/video-assets',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { title: 'x' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('lifecycle and delivery', () => {
    let assetId: string;
    let courseId: string;
    let contentId: string;

    it('creates a pending video asset without exposing secrets', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/video-assets',
        headers: admin(),
        payload: { title: 'Intro Lesson' },
      });
      expect(response.statusCode).toBe(201);
      const body = json(response);
      expect(body.status).toBe('PENDING_UPLOAD');
      expect(response.body).not.toContain(process.env.BUNNY_STREAM_API_KEY);
      expect(response.body).not.toContain(READ_ONLY_KEY);
      assetId = body.id;
    });

    it('restricts admin playback and refuses videos that are not ready', async () => {
      const unauthenticated = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/video-assets/${assetId}/playback`,
      });
      expect(unauthenticated.statusCode).toBe(401);

      const student = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/video-assets/${assetId}/playback`,
        headers: { authorization: `Bearer ${studentToken}` },
      });
      expect(student.statusCode).toBe(403);

      const pending = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/video-assets/${assetId}/playback`,
        headers: admin(),
      });
      expect(pending.statusCode).toBe(409);

      const missing = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/video-assets/missing-video/playback',
        headers: admin(),
      });
      expect(missing.statusCode).toBe(404);
    });

    it('issues signed upload authorization and moves to UPLOADING', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/upload-authorization`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(201);
      const body = json(response);
      expect(body.endpoint).toBe('https://video.bunnycdn.com/tusupload');
      expect(body.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body).not.toContain(process.env.BUNNY_STREAM_API_KEY);
      expect(response.body).not.toContain(READ_ONLY_KEY);
    });

    it('restricts upload confirmation to administrators', async () => {
      const unauthenticated = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/upload-confirmation`,
      });
      expect(unauthenticated.statusCode).toBe(401);
      const student = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/upload-confirmation`,
        headers: { authorization: `Bearer ${studentToken}` },
      });
      expect(student.statusCode).toBe(403);
    });

    it('records client-reported TUS completion without treating it as Bunny processing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/upload-confirmation`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(201);
      const body = json(response);
      expect(body.status).toBe('UPLOADED_AWAITING_PROCESSING');
      expect(body.video.processingStatus).toBe('UPLOADING');
      expect(body.video.clientUploadCompletedAt).toBeTruthy();
    });

    it('treats repeated upload confirmation as safe and does not overwrite the timestamp', async () => {
      const first = await app
        .get(PrismaService)
        .videoAsset.findUnique({ where: { assetId } });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/upload-confirmation`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(201);
      expect(json(response).status).toBe('UPLOADED_AWAITING_PROCESSING');
      const second = await app
        .get(PrismaService)
        .videoAsset.findUnique({ where: { assetId } });
      expect(second?.clientUploadCompletedAt).toEqual(first?.clientUploadCompletedAt);
    });

    it('allows attaching an in-flight video and reports its state', async () => {
      // Build and publish the delivery hierarchy up front.
      const gradeId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/academic-grades',
          headers: admin(),
          payload: { title: 'Video Grade' },
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
          payload: { title: 'Video Subject', academicGradeId: gradeId },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/publish`,
        headers: admin(),
      });
      courseId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/courses',
          headers: admin(),
          payload: { title: 'Video Course', subjectId, accessType: 'PUBLIC' },
        }),
      ).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/courses/${courseId}/publish`,
        headers: admin(),
      });

      contentId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/content-items',
          headers: admin(),
          payload: { type: 'VIDEO', title: 'A Video', placement: { courseId } },
        }),
      ).id;

      const attach = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId },
      });
      expect(attach.statusCode).toBe(201);
      expect(json(attach).primaryAsset).toMatchObject({
        id: assetId,
        kind: 'VIDEO',
        status: 'UPLOADED_AWAITING_PROCESSING',
        processingStatus: 'UPLOADING',
        processingProgress: 0,
      });

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/content-items/${contentId}`,
        headers: admin(),
      });
      expect(detail.statusCode).toBe(200);
      expect(json(detail).primaryAsset).toMatchObject({
        id: assetId,
        filename: 'video',
        video: {
          processingStatus: 'UPLOADING',
          processingProgress: 0,
          attempt: 1,
          readyAt: null,
          failedAt: null,
        },
      });

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/content-items?courseId=${courseId}`,
        headers: admin(),
      });
      expect(list.statusCode).toBe(200);
      expect(json(list).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: contentId,
            primaryAsset: expect.objectContaining({
              id: assetId,
              status: 'UPLOADED_AWAITING_PROCESSING',
              processingStatus: 'UPLOADING',
              processingProgress: 0,
            }),
          }),
        ]),
      );

      const publish = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/publish`,
        headers: admin(),
      });
      expect(publish.statusCode).toBe(409);
      expect(json(publish)).toMatchObject({
        code: 'VIDEO_NOT_READY',
        message: {
          en: 'Video is not ready for publication',
          ar: 'الفيديو غير جاهز للنشر',
        },
        meta: {
          assetId,
          assetStatus: 'UPLOADED_AWAITING_PROCESSING',
          processingStatus: 'UPLOADING',
          processingProgress: 0,
          readyAt: null,
          failedAt: null,
        },
      });
    });

    it('marks the video ready on a signed processing-complete webhook', async () => {
      const guid = await bunnyIdFor(assetId);
      const response = await postWebhook({
        VideoGuid: guid,
        Status: 3,
        Length: 42,
      });
      expect(response.statusCode).toBe(201);
      const asset = await app
        .get(PrismaService)
        .asset.findUnique({ where: { id: assetId } });
      expect(asset?.status).toBe('READY');
    });

    it('treats a repeated webhook as a safe duplicate', async () => {
      const guid = await bunnyIdFor(assetId);
      const response = await postWebhook({
        VideoGuid: guid,
        Status: 3,
        Length: 42,
      });
      expect(json(response)).toMatchObject({ duplicate: true });
      const count = await app.get(PrismaService).bunnyStreamWebhookEvent.count({
        where: { bunnyVideoId: guid, status: 3 },
      });
      expect(count).toBe(1);
    });

    it('ignores a state regression away from READY', async () => {
      const guid = await bunnyIdFor(assetId);
      await postWebhook({ VideoGuid: guid, Status: 1 });
      const asset = await app
        .get(PrismaService)
        .asset.findUnique({ where: { id: assetId } });
      expect(asset?.status).toBe('READY');
    });

    it('lets an administrator preview a ready, unattached video', async () => {
      const access = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/video-assets/${assetId}/playback`,
        headers: admin(),
      });
      expect(access.statusCode).toBe(200);
      const body = json(access);
      expect(body.embedUrl).toContain('iframe.mediadelivery.net');
      expect(body.embedUrl).toContain('token=');
      expect(access.body).not.toContain(
        process.env.BUNNY_STREAM_PLAYER_TOKEN_KEY,
      );
    });

    it('rejects a webhook with an invalid signature', async () => {
      const guid = await bunnyIdFor(assetId);
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/bunny-stream/webhook',
        headers: {
          'content-type': 'application/json',
          'x-bunnystream-signature': 'a'.repeat(64),
          'x-bunnystream-signature-version': 'v1',
          'x-bunnystream-signature-algorithm': 'hmac-sha256',
        },
        payload: JSON.stringify({ VideoGuid: guid, Status: 3 }),
      });
      expect(response.statusCode).toBe(401);
    });

    it('delivers authorized playback once ready', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/admin/content-items/${contentId}/primary-asset`,
        headers: admin(),
        payload: { assetId },
      });
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
      expect(body.embedUrl).toContain('iframe.mediadelivery.net');
      expect(body.embedUrl).toContain('token=');
      expect(access.body).not.toContain(
        process.env.BUNNY_STREAM_PLAYER_TOKEN_KEY,
      );
    });
  });

  describe('failure and retry', () => {
    let assetId: string;

    it('records a failed processing webhook with failure metadata', async () => {
      assetId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/video-assets',
          headers: admin(),
          payload: { title: 'Broken Lesson' },
        }),
      ).id;
      const guid = await bunnyIdFor(assetId);
      await postWebhook({ VideoGuid: guid, Status: 5 });
      const video = await app
        .get(PrismaService)
        .videoAsset.findUnique({ where: { assetId } });
      const asset = await app
        .get(PrismaService)
        .asset.findUnique({ where: { id: assetId } });
      expect(asset?.status).toBe('FAILED');
      expect(video?.failureMetadata).toMatchObject({ bunnyStatus: 5 });
    });

    it('retries a failed asset and increments the attempt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/retry`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(201);
      const body = json(response);
      expect(body.status).toBe('PENDING_UPLOAD');
      expect(body.video.attempt).toBe(2);
    });

    it('refuses to retry an asset that is not failed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/video-assets/${assetId}/retry`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe('explicit cleanup', () => {
    it('deletes an unreferenced video asset', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/video-assets',
        headers: admin(),
        payload: { title: 'Disposable video' },
      });
      expect(created.statusCode).toBe(201);
      const id = json(created).id;
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/video-assets/${id}`,
        headers: admin(),
      });
      expect(deleted.statusCode).toBe(200);
      expect(json(deleted)).toEqual({ id, deleted: true });
    });
  });
});
