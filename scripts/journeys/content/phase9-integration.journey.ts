import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { assert, expectStatus, expectString } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

const PDF_BYTES = Buffer.from(
  '%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
);
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
  'base64',
);

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function uploadTus(
  authorization: {
    endpoint: string;
    signature: string;
    expires: number;
    libraryId: string;
    videoId: string;
  },
  bytes: Buffer,
  filename: string,
) {
  const headers = {
    'Tus-Resumable': '1.0.0',
    AuthorizationSignature: authorization.signature,
    AuthorizationExpire: String(authorization.expires),
    LibraryId: String(authorization.libraryId),
    VideoId: authorization.videoId,
  };
  const metadata = `filename ${Buffer.from(filename).toString('base64')},filetype ${Buffer.from('video/mp4').toString('base64')}`;
  const created = await fetch(authorization.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Upload-Length': String(bytes.length),
      'Upload-Metadata': metadata,
    },
  });
  if (created.status !== 201)
    throw new Error(`Bunny TUS creation failed with ${created.status}`);
  const location = created.headers.get('location');
  if (!location)
    throw new Error('Bunny TUS creation returned no upload location');
  const url = new URL(location, authorization.endpoint).toString();
  const uploaded = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': '0',
      'Content-Length': String(bytes.length),
    },
    body: new Uint8Array([...bytes]),
  });
  if (uploaded.status !== 204)
    throw new Error(`Bunny TUS upload failed with ${uploaded.status}`);
}

/** CONTENT-007 — Full live-Bunny content acceptance and authorization boundary. */
export const phase9IntegrationJourney: JourneyDefinition = {
  id: 'CONTENT-007',
  name: 'Phase 9 live Bunny integration and hardening',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-003', 'AUTH-004'],
  async run({ clients, context, environment, factory, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);
    const gradeId = String(context.academic.gradeId);
    const entitledStudent = context.students[0];
    const videoFile = environment.videoFile;
    if (!videoFile)
      throw new Error(
        'CONTENT-007 requires JOURNEY_VIDEO_FILE pointing to a small valid MP4',
      );
    if (!entitledStudent?.id || !entitledStudent.accessToken)
      throw new Error('A registered student is required');
    const videoBytes = await readFile(videoFile);
    if (!videoBytes.length) throw new Error('JOURNEY_VIDEO_FILE is empty');
    let pdfAssetId = '';
    let videoAssetId = '';
    let pdfContentId = '';
    let videoContentId = '';
    let unentitledToken = '';

    await step('Uploading a real cover and PDF to Bunny Storage', async () => {
      const cover = await admin.upload<any>(
        '/admin/assets/upload?kind=COVER_IMAGE',
        {
          buffer: PNG_BYTES,
          filename: 'phase9-cover.png',
          contentType: 'image/png',
        },
      );
      expectStatus(cover, 201);
      assert(cover.body.status === 'READY', 'Cover must be ready');
      expectStatus(
        await admin.request<any>(
          'POST',
          `/admin/assets/covers/courses/${courseId}`,
          { assetId: cover.body.id },
        ),
        201,
      );
      const pdf = await admin.upload<any>('/admin/assets/upload?kind=PDF', {
        buffer: PDF_BYTES,
        filename: 'phase9-resource.pdf',
        contentType: 'application/pdf',
      });
      expectStatus(pdf, 201);
      pdfAssetId = pdf.body.id;
    });

    await step('Authoring and publishing protected PDF content', async () => {
      const item = await admin.request<any>('POST', '/admin/content-items', {
        type: 'PDF',
        title: factory.title('Phase 9 PDF'),
        placement: { courseId },
      });
      expectStatus(item, 201);
      pdfContentId = item.body.id;
      expectStatus(
        await admin.request<any>(
          'POST',
          `/admin/content-items/${pdfContentId}/primary-asset`,
          { assetId: pdfAssetId },
        ),
        201,
      );
      expectStatus(
        await admin.request<any>(
          'POST',
          `/admin/content-items/${pdfContentId}/publish`,
        ),
        201,
      );
    });

    await step(
      'Uploading a real video through Bunny TUS and waiting for the verified webhook',
      async () => {
        const video = await admin.request<any>('POST', '/admin/video-assets', {
          title: factory.title('Phase 9 video'),
          filename: basename(videoFile),
        });
        expectStatus(video, 201);
        videoAssetId = video.body.id;
        const authorization = await admin.request<any>(
          'POST',
          `/admin/video-assets/${videoAssetId}/upload-authorization`,
        );
        expectStatus(authorization, 201);
        context.academic.coverageVideoAssetId = videoAssetId;
        context.academic.coverageVideoBunnyId = authorization.body.videoId;
        await uploadTus(
          authorization.body,
          videoBytes,
          basename(videoFile),
        );
        const deadline = Date.now() + environment.videoReadyTimeoutMs;
        while (Date.now() < deadline) {
          const state = await admin.request<any>(
            'GET',
            `/admin/video-assets/${videoAssetId}`,
          );
          expectStatus(state, 200);
          if (state.body.status === 'READY') return;
          if (state.body.status === 'FAILED')
            throw new Error(
              `Bunny video processing failed: ${JSON.stringify(state.body)}`,
            );
          await pause(environment.videoPollIntervalMs);
        }
        throw new Error(
          `Bunny video did not reach READY within ${environment.videoReadyTimeoutMs}ms. Verify JOURNEY_BUNNY_WEBHOOK_URL (${environment.bunnyWebhookUrl ?? 'not set'}) is configured in the Stream library.`,
        );
      },
    );

    await step(
      'Publishing video content, publisher terms, and a question bank',
      async () => {
        const videoItem = await admin.request<any>(
          'POST',
          '/admin/content-items',
          {
            type: 'VIDEO',
            title: factory.title('Phase 9 video lesson'),
            placement: { chapterId },
          },
        );
        expectStatus(videoItem, 201);
        videoContentId = videoItem.body.id;
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/content-items/${videoContentId}/primary-asset`,
            { assetId: videoAssetId },
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/content-items/${videoContentId}/publish`,
          ),
          201,
        );
        const agreement = await admin.request<any>(
          'POST',
          '/admin/publisher-agreements',
          {
            courseId,
            publisherUserId: context.partner.id,
            revenueShareBps: 1500,
            startsAt: new Date().toISOString(),
            // CONTENT-005 already owns the course's primary agreement. This
            // independent integration agreement only needs to be active.
            isPrimary: false,
          },
        );
        expectStatus(agreement, 201);
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/publisher-agreements/${agreement.body.id}/activate`,
          ),
          201,
        );
        const source = await admin.request<any>(
          'POST',
          '/admin/question-banks/sources',
          {
            type: 'CONTENT_PUBLISHER',
            title: factory.localizedTitle('Phase 9 source'),
            publisherUserId: context.partner.id,
          },
        );
        expectStatus(source, 201);
        const bank = await admin.request<any>('POST', '/admin/question-banks', {
          title: factory.title('Phase 9 bank'),
        });
        expectStatus(bank, 201);
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/sources/${source.body.id}/publish`,
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/${bank.body.id}/publish`,
          ),
          201,
        );
        const question = await admin.request<any>('POST', '/admin/questions', {
          bankId: bank.body.id,
          sourceId: source.body.id,
          courseId,
          placements: [{ chapterId }],
          body: 'Which option is correct?',
          explanation: 'The marked option is correct.',
        });
        expectStatus(question, 201);
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${question.body.id}/options`,
            { body: 'Correct', isCorrect: true },
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${question.body.id}/options`,
            { body: 'Incorrect', isCorrect: false },
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${question.body.id}/submit`,
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${question.body.id}/publish`,
          ),
          201,
        );
      },
    );

    await step(
      'Showing a safe locked catalog outline before access is granted',
      async () => {
        expectStatus(
          await admin.request<any>(
            'PATCH',
            `/admin/courses/${courseId}/access`,
            { accessType: 'PAID' },
          ),
          200,
        );
        const outline = await clients.public.request<any>(
          'GET',
          `/catalog/courses/${courseId}/outline`,
        );
        expectStatus(outline, 200);
        assert(
          JSON.stringify(outline.body).includes('"isLocked":true'),
          'Anonymous outline must show protected content as locked',
        );
        assert(
          !JSON.stringify(outline.body).includes('storageKey'),
          'Catalog must not expose storage internals',
        );
      },
    );

    await step(
      'Granting course access and delivering the real PDF and video to the student',
      async () => {
        expectStatus(
          await admin.request<any>('POST', '/admin/entitlements', {
            studentUserId: entitledStudent.id,
            courseId,
          }),
          201,
        );
        const pdf = await clients.student.request<any>(
          'GET',
          `/student/content-items/${pdfContentId}/assets/${pdfAssetId}/access`,
          undefined,
          { accessToken: entitledStudent.accessToken },
        );
        expectStatus(pdf, 200);
        expectString(pdf.body.url, 'PDF access URL');
        const pdfFetch = await fetch(pdf.body.url);
        assert(
          pdfFetch.ok,
          `Signed PDF URL must resolve (received ${pdfFetch.status})`,
        );
        const playback = await clients.student.request<any>(
          'GET',
          `/student/content-items/${videoContentId}/assets/${videoAssetId}/access`,
          undefined,
          { accessToken: entitledStudent.accessToken },
        );
        expectStatus(playback, 200);
        expectString(playback.body.embedUrl, 'video playback URL');
        const player = await fetch(playback.body.embedUrl);
        assert(
          player.ok,
          `Signed Bunny player URL must resolve (received ${player.status})`,
        );
      },
    );

    await step(
      'Denying protected delivery to a non-entitled student and to partners',
      async () => {
        const registration = await clients.public.request<any>(
          'POST',
          '/auth/students/register',
          {
            fullName: factory.title('Phase 9 denied student'),
            nationalId: factory.nationalId(),
            phone: `+20${factory.phone().slice(1)}`,
            parentPhone: factory.phone(),
            governorateId: String(context.academic.governorateId),
            academicGradeId: gradeId,
            password: factory.password('Denied'),
          },
        );
        expectStatus(registration, 201);
        unentitledToken = registration.body.accessToken;
        expectStatus(
          await clients.student.request<any>(
            'GET',
            `/student/content-items/${pdfContentId}/assets/${pdfAssetId}/access`,
            undefined,
            { accessToken: unentitledToken },
          ),
          403,
        );
        expectStatus(
          await clients.partner.request<any>(
            'GET',
            `/student/content-items/${videoContentId}/assets/${videoAssetId}/access`,
          ),
          403,
        );
      },
    );
  },
};
