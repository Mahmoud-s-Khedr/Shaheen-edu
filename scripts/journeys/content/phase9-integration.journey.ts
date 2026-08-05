import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus, expectString } from '../lib/assertions.js';
import { fetchDeliveryUrl } from '../lib/delivery.js';
import type { JourneyDefinition } from '../lib/types.js';

const testFiles = resolve(process.cwd(), 'test-files');
const testCover = resolve(testFiles, 'G5LDVlJWQAANOhJ.jpg');
const testPdf = resolve(testFiles, '1-84628-843-6.pdf');
const testVideo = resolve(testFiles, 'Screencast From 2026-07-24 16-51-21.mp4');

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
    const videoFile = testVideo;
    const [videoBytes, coverBytes, pdfBytes] = await Promise.all([readFile(videoFile), readFile(testCover), readFile(testPdf)]);
    if (!videoBytes.length) throw new Error('JOURNEY_VIDEO_FILE is empty');
    const filePrefix = `phase9-${factory.runId}`;
    let pdfAssetId = '';
    let videoAssetId = '';
    let pdfContentId = '';
    let videoContentId = '';
    let questionId = '';
    let unentitledToken = '';
    let deliveryStudentId = '';
    let deliveryStudentToken = '';

    await step('Uploading a real cover and PDF to Bunny Storage', async () => {
      const cover = await admin.upload<any>(
        '/admin/assets/upload?kind=COVER_IMAGE',
        {
          buffer: coverBytes,
          filename: `${filePrefix}-cover.jpg`,
          contentType: 'image/jpeg',
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
      const adminCover = await admin.request<any>('GET', `/admin/assets/${cover.body.id}/access`);
      expectStatus(adminCover, 200);
      await fetchDeliveryUrl(adminCover.body.url, 'Admin cover preview');
      const courseRead = await admin.request<any>('GET', `/admin/courses/${courseId}`);
      expectStatus(courseRead, 200);
      assert(courseRead.body.coverAssetId === cover.body.id, 'Course read must expose its linked cover asset ID');
      const publicCover = await clients.public.request<any>('GET', `/catalog/courses/${courseId}/cover/access`);
      expectStatus(publicCover, 200);
      await fetchDeliveryUrl(publicCover.body.url, 'Public course cover');
      const pdf = await admin.upload<any>('/admin/assets/upload?kind=PDF', {
        buffer: pdfBytes,
        filename: `${filePrefix}-resource.pdf`,
        contentType: 'application/pdf',
      });
      expectStatus(pdf, 201);
      pdfAssetId = pdf.body.id;
      const adminPdf = await admin.request<any>('GET', `/admin/assets/${pdfAssetId}/access`);
      expectStatus(adminPdf, 200);
      await fetchDeliveryUrl(adminPdf.body.url, 'Admin PDF preview');
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
          filename: `${filePrefix}-video.mp4`,
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
          `${filePrefix}-video.mp4`,
        );
        const confirmation = await admin.request<any>(
          'POST',
          `/admin/video-assets/${videoAssetId}/upload-confirmation`,
        );
        expectStatus(confirmation, 201);
        assert(
          confirmation.body.status === 'UPLOADED_AWAITING_PROCESSING',
          'Client TUS completion must create the Bunny-processing diagnostic boundary',
        );
        assert(
          confirmation.body.video?.processingStatus === 'UPLOADING',
          'Client confirmation must not claim Bunny processing has started',
        );
        expectString(
          confirmation.body.video?.clientUploadCompletedAt,
          'client upload completion timestamp',
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
        const adminPreview = await admin.request<any>(
          'GET',
          `/admin/video-assets/${videoAssetId}/playback`,
        );
        expectStatus(adminPreview, 200);
        expectString(adminPreview.body.embedUrl, 'admin video preview URL');
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
        questionId = question.body.id;
        expectStatus(await admin.request<any>('POST', `/admin/questions/${questionId}/assets`, { assetId: pdfAssetId }), 201);
        expectStatus(
          await admin.request<any>(
            'POST',
          `/admin/questions/${questionId}/options`,
            { body: 'Correct', isCorrect: true },
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
          `/admin/questions/${questionId}/options`,
            { body: 'Incorrect', isCorrect: false },
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
          `/admin/questions/${questionId}/submit`,
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
          `/admin/questions/${questionId}/publish`,
          ),
          201,
        );
      },
    );

    await step(
      'Showing a safe bounded catalog preview before access is granted',
      async () => {
        expectStatus(
          await admin.request<any>(
            'PATCH',
            `/admin/courses/${courseId}/access`,
            { accessType: 'PAID' },
          ),
          200,
        );
        const outline = await clients.public.request<any>('GET', `/catalog/courses/${courseId}/content-items`);
        expectStatus(outline, 200);
        assert(
          outline.body.data.length > 0,
          'Anonymous catalog returns bounded published previews',
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
        const registration = await clients.public.request<any>(
          'POST',
          '/auth/students/register',
          {
            fullName: factory.title('Phase 9 delivery student'),
            nationalId: factory.nationalId(),
            phone: `+20${factory.phone().slice(1)}`,
            parentPhone: factory.phone(),
            governorateId: String(context.academic.governorateId),
            academicGradeId: gradeId,
            password: factory.password('Delivery'),
          },
        );
        expectStatus(registration, 201);
        deliveryStudentId = String(registration.body.user.id);
        deliveryStudentToken = String(registration.body.accessToken);
        context.created.students.push(deliveryStudentId);

        expectStatus(
          await admin.request<any>('POST', '/admin/entitlements', {
            studentUserId: deliveryStudentId,
            courseId,
          }),
          201,
        );
        const pdf = await clients.student.request<any>(
          'GET',
          `/student/content-items/${pdfContentId}/assets/${pdfAssetId}/access`,
          undefined,
          { accessToken: deliveryStudentToken },
        );
        expectStatus(pdf, 200);
        await fetchDeliveryUrl(pdf.body.url, 'Student PDF delivery');
        const questionAsset = await clients.student.request<any>(
          'GET',
          `/student/practice/questions/${questionId}/assets/${pdfAssetId}/access`,
          undefined,
          { accessToken: deliveryStudentToken },
        );
        expectStatus(questionAsset, 200);
        await fetchDeliveryUrl(questionAsset.body.url, 'Student practice-question PDF delivery');
        const playback = await clients.student.request<any>(
          'GET',
          `/student/content-items/${videoContentId}/assets/${videoAssetId}/access`,
          undefined,
          { accessToken: deliveryStudentToken },
        );
        expectStatus(playback, 200);
        expectString(playback.body.embedUrl, 'video playback URL');
        await fetchDeliveryUrl(playback.body.embedUrl, 'Student video playback');
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
