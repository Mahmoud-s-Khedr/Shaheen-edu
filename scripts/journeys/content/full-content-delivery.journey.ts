import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus, expectString } from '../lib/assertions.js';
import { fetchDeliveryUrl } from '../lib/delivery.js';
import type { JourneyDefinition } from '../lib/types.js';

// Keep the acceptance fixture below the documented 25 MiB default asset limit.
// This journey verifies authorization, delivery, and access control—not the
// deployment-specific maximum upload size.
const testPdf = resolve(process.cwd(), 'test-files', '1-84628-843-6.pdf');

/**
 * CONTENT-003 — End-to-end content delivery across Phases 1-4.
 *
 * Exercises the real API against real Bunny: it reuses the published hierarchy from
 * CONTENT-001 (Phase 1), authors an asset-backed content item (Phase 2), uploads a file
 * to Bunny Storage and delivers a signed URL (Phase 3), and creates a Bunny Stream video
 * with a signed direct-upload authorization (Phase 4). The live TUS byte-upload plus
 * encode/webhook/playback path is intentionally out of scope here (it is verified with
 * `dev/manual-test-console.html`); this journey proves every server-owned contract the
 * frontend integrates against.
 */
export const fullDeliveryJourney: JourneyDefinition = {
  id: 'CONTENT-003', name: 'End-to-end content delivery (Phases 1-4)', category: 'content', dependsOn: ['CONTENT-001', 'AUTH-003'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin; const courseId = String(context.academic.courseId); const gradeId = String(context.academic.gradeId);
    const pdfBytes = await readFile(testPdf); const filePrefix = `delivery-${factory.runId}`;
    let assetId = ''; let replacementAssetId = ''; let pdfContentId = ''; let videoAssetId = ''; let studentToken = '';

    await step('Phase 3: uploading a file asset to Bunny Storage', async () => {
      const r = await admin.upload<any>('/admin/assets/upload?kind=PDF', { buffer: pdfBytes, filename: `${filePrefix}-lesson.pdf`, contentType: 'application/pdf' });
      expectStatus(r, 201); assert(r.body.status === 'READY', 'Uploaded asset must reach READY');
      assert(!('storageKey' in r.body) && !JSON.stringify(r.body).includes('assets/pdf/'), 'Storage internals must never be returned');
      assetId = r.body.id;
      const bad = await admin.upload<any>('/admin/assets/upload?kind=PDF', { buffer: pdfBytes, filename: `${filePrefix}-wrong-extension.txt`, contentType: 'application/pdf' });
      expectStatus(bad, 400);
    });

    await step('Phase 2/3: authoring a PDF content item backed by the ready asset', async () => {
      const item = await admin.request<any>('POST', '/admin/content-items', { type: 'PDF', title: factory.title('Delivery PDF'), placement: { courseId } }); expectStatus(item, 201); pdfContentId = item.body.id; context.created.contentItems.push(pdfContentId);
      const attach = await admin.request<any>('POST', `/admin/content-items/${pdfContentId}/primary-asset`, { assetId }); expectStatus(attach, 201);
      const access = await admin.request<any>('PATCH', `/admin/content-items/${pdfContentId}/access`, { accessType: 'PUBLIC' }); expectStatus(access, 200);
      const publish = await admin.request<any>('POST', `/admin/content-items/${pdfContentId}/publish`); expectStatus(publish, 201); assert(publish.body.status === 'PUBLISHED', 'Content item must publish');
    });

    await step('Phase 3: reference protection blocks deleting/archiving an attached asset', async () => {
      const del = await admin.request<any>('DELETE', `/admin/assets/${assetId}`); expectStatus(del, 409);
      const archive = await admin.request<any>('POST', `/admin/assets/${assetId}/archive`); expectStatus(archive, 409);
    });

    await step('Phase 3: public delivery returns a short-lived signed Bunny URL that resolves', async () => {
      const access = await clients.public.request<any>('GET', `/catalog/content-items/${pdfContentId}/assets/${assetId}/access`); expectStatus(access, 200);
      expectString(access.body.url, 'signed url'); assert(/token=.+expires=\d+/.test(access.body.url), 'Delivery URL must be token-authenticated and time-limited'); assert(Boolean(access.body.expiresAt), 'Delivery URL must expose an expiry');
      await fetchDeliveryUrl(access.body.url, 'Public PDF delivery');
    });

    await step('Phase 3/7: an authenticated student receives a signed URL for the same content', async () => {
      const phone = factory.phone(); const password = factory.password('Student');
      const reg = await clients.public.request<any>('POST', '/auth/students/register', { fullName: factory.title('Delivery Student'), nationalId: factory.nationalId(), phone: `+20${phone.slice(1)}`, parentPhone: factory.phone(), governorateId: String(context.academic.governorateId), academicGradeId: gradeId, password });
      expectStatus(reg, 201); studentToken = reg.body.accessToken; context.created.students.push(reg.body.user.id);
      const access = await clients.public.request<any>('GET', `/student/content-items/${pdfContentId}/assets/${assetId}/access`, undefined, { accessToken: studentToken }); expectStatus(access, 200); expectString(access.body.url, 'student signed url'); await fetchDeliveryUrl(access.body.url, 'Student PDF delivery');
    });

    await step('Phase 3: replacing the primary asset archives the displaced asset', async () => {
      const upload = await admin.upload<any>('/admin/assets/upload?kind=PDF', { buffer: pdfBytes, filename: `${filePrefix}-lesson-v2.pdf`, contentType: 'application/pdf' }); expectStatus(upload, 201); replacementAssetId = upload.body.id;
      const replace = await admin.request<any>('POST', `/admin/content-items/${pdfContentId}/primary-asset`, { assetId: replacementAssetId }); expectStatus(replace, 201);
      const displaced = await admin.request<any>('GET', `/admin/assets/${assetId}`); expectStatus(displaced, 200); assert(displaced.body.status === 'ARCHIVED', 'Displaced asset must be archived once unreferenced');
    });

    await step('Phase 4: creating a Bunny Stream video and a signed direct-upload authorization', async () => {
      const create = await admin.request<any>('POST', '/admin/video-assets', { title: factory.title('Delivery Video') }); expectStatus(create, 201); assert(create.body.status === 'PENDING_UPLOAD', 'New video asset must be PENDING_UPLOAD'); videoAssetId = create.body.id;
      const authz = await admin.request<any>('POST', `/admin/video-assets/${videoAssetId}/upload-authorization`); expectStatus(authz, 201);
      assert(authz.body.endpoint === 'https://video.bunnycdn.com/tusupload', 'Authorization must return the Bunny TUS endpoint');
      expectString(authz.body.signature, 'tus signature'); assert(/^[0-9a-f]{64}$/.test(authz.body.signature), 'Signature must be a SHA-256 hex digest'); expectString(authz.body.videoId, 'bunny video id');
    });

    await step('Phase 4: an in-flight video can be linked, but cannot be published', async () => {
      const item = await admin.request<any>('POST', '/admin/content-items', { type: 'VIDEO', title: factory.title('Video content'), placement: { courseId } }); expectStatus(item, 201); context.created.contentItems.push(item.body.id);
      const attach = await admin.request<any>('POST', `/admin/content-items/${item.body.id}/primary-asset`, { assetId: videoAssetId }); expectStatus(attach, 201);
      assert(attach.body.primaryAsset?.id === videoAssetId && attach.body.primaryAsset?.status === 'PENDING_UPLOAD', 'Primary-asset link must return the pending video state');
      const detail = await admin.request<any>('GET', `/admin/content-items/${item.body.id}`); expectStatus(detail, 200);
      assert(detail.body.primaryAsset?.video?.processingStatus === 'CREATED' && detail.body.primaryAsset?.video?.attempt === 1, 'Content detail must expose the linked video processing state');
      const list = await admin.request<any>('GET', `/admin/content-items?courseId=${courseId}`); expectStatus(list, 200);
      const listed = list.body.data.find((entry: any) => entry.id === item.body.id);
      assert(listed?.primaryAsset?.id === videoAssetId && listed.primaryAsset?.processingStatus === 'CREATED', 'Content list must expose lightweight primary-asset processing state');
      const publish = await admin.request<any>('POST', `/admin/content-items/${item.body.id}/publish`); expectStatus(publish, 409);
      assert(publish.body.code === 'VIDEO_NOT_READY' && publish.body.meta?.assetId === videoAssetId && publish.body.meta?.assetStatus === 'PENDING_UPLOAD' && publish.body.meta?.processingStatus === 'CREATED', 'Unready video publication must return VIDEO_NOT_READY state metadata');
      const retry = await admin.request<any>('POST', `/admin/video-assets/${videoAssetId}/retry`); expectStatus(retry, 409);
      const archive = await admin.request<any>('POST', `/admin/video-assets/${videoAssetId}/archive`); expectStatus(archive, 409);
    });

    await step('Access control: partners and anonymous callers are denied protected operations', async () => {
      const partnerUpload = await clients.partner.upload<any>('/admin/assets/upload?kind=PDF', { buffer: pdfBytes, filename: `${filePrefix}-denied.pdf`, contentType: 'application/pdf' }); expectStatus(partnerUpload, 403);
      const partnerVideo = await clients.partner.request<any>('POST', '/admin/video-assets', { title: factory.title('Denied video') }); expectStatus(partnerVideo, 403);
      const anonAsset = await clients.public.request<any>('GET', `/admin/assets/${replacementAssetId}`); expectStatus(anonAsset, 401);
    });
  },
};
