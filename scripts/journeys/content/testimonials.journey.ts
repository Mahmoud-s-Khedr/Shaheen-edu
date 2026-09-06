import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus, expectString } from '../lib/assertions.js';
import { fetchDeliveryUrl } from '../lib/delivery.js';
import type { JourneyDefinition } from '../lib/types.js';

const testImage = resolve(process.cwd(), 'test-files', 'G5LDVlJWQAANOhJ.jpg');

/** CONTENT-023 — curated testimonials, including a real MinIO-backed screenshot. */
export const testimonialsJourney: JourneyDefinition = {
  id: 'CONTENT-023',
  name: 'Testimonials authoring, publication, ordering, and screenshot delivery',
  category: 'content',
  dependsOn: ['INFRA-001'],
  async run({ clients, factory, step }) {
    const admin = clients.superAdmin;
    const publicApi = clients.public;
    const text = `The lessons are clearer every day — ${factory.runId}`;
    let textOnlyId = '';
    let screenshotId = '';
    let screenshotAssetId = '';

    await step('Logging in as the seeded super admin', async () => {
      const login = await admin.request<any>('POST', '/auth/admins/login', {
        email: process.env.SUPER_ADMIN_EMAIL,
        password: process.env.SUPER_ADMIN_PASSWORD,
      });
      expectStatus(login, 201);
      admin.accessToken = login.body.accessToken;
    });

    await step(
      'Creating draft testimonials and a real IMAGE asset',
      async () => {
        const image = await readFile(testImage);
        const upload = await admin.upload<any>(
          '/admin/assets/upload?kind=IMAGE',
          {
            buffer: image,
            filename: `testimonial-${factory.runId}.jpg`,
            contentType: 'image/jpeg',
          },
        );
        expectStatus(upload, 201);
        screenshotAssetId = upload.body.id;

        const textOnly = await admin.request<any>(
          'POST',
          '/admin/testimonials',
          {
            reviewText: text,
            reviewerName: 'Text-only learner',
          },
        );
        expectStatus(textOnly, 201);
        textOnlyId = textOnly.body.id;
        assert(
          textOnly.body.status === 'DRAFT',
          'New testimonials must be drafts',
        );

        const screenshot = await admin.request<any>(
          'POST',
          '/admin/testimonials',
          {
            reviewText: 'The screenshot version is just as useful.',
            reviewerName: 'Screenshot learner',
            screenshotAssetId,
            screenshotAltText:
              'A learner praising clear lessons in a chat message.',
          },
        );
        expectStatus(screenshot, 201);
        screenshotId = screenshot.body.id;
        assert(
          screenshot.body.screenshotAssetId === screenshotAssetId,
          'Testimonial must retain its screenshot asset',
        );
      },
    );

    await step(
      'Listing, reading, and editing drafts as an administrator',
      async () => {
        const list = await admin.request<any>('GET', '/admin/testimonials');
        expectStatus(list, 200);
        assert(
          list.body.data.some((item: any) => item.id === textOnlyId),
          'Admin list must include the text testimonial',
        );
        const read = await admin.request<any>(
          'GET',
          `/admin/testimonials/${textOnlyId}`,
        );
        expectStatus(read, 200);
        assert(
          read.body.reviewText === text,
          'Admin get must return the created testimonial',
        );
        const update = await admin.request<any>(
          'PATCH',
          `/admin/testimonials/${textOnlyId}`,
          {
            reviewText: `${text} (edited)`,
          },
        );
        expectStatus(update, 200);
        assert(
          update.body.reviewText === `${text} (edited)`,
          'PATCH must persist the revised review text',
        );
      },
    );

    await step(
      'Reordering non-archived testimonials and protecting their asset',
      async () => {
        const reorder = await admin.request(
          'POST',
          '/admin/testimonials/reorder',
          {
            items: [
              { id: screenshotId, sortOrder: 1 },
              { id: textOnlyId, sortOrder: 2 },
            ],
          },
        );
        expectStatus(reorder, 201);
        const protectedAsset = await admin.request(
          'DELETE',
          `/admin/assets/${screenshotAssetId}`,
        );
        expectStatus(protectedAsset, 409);
      },
    );

    await step(
      'Publishing exposes only the published testimonial and its screenshot',
      async () => {
        expectStatus(
          await admin.request(
            'POST',
            `/admin/testimonials/${screenshotId}/publish`,
          ),
          201,
        );
        const publicList = await publicApi.request<any>('GET', '/testimonials');
        expectStatus(publicList, 200);
        const published = publicList.body.data.find(
          (item: any) => item.id === screenshotId,
        );
        assert(published, 'Public list must include the published testimonial');
        assert(
          !publicList.body.data.some((item: any) => item.id === textOnlyId),
          'Public list must exclude drafts',
        );
        expectString(
          published.screenshotAccessPath,
          'published screenshot access path',
        );
        const access = await publicApi.request<any>(
          'GET',
          `/testimonials/${screenshotId}/screenshot/access`,
        );
        expectStatus(access, 200);
        await fetchDeliveryUrl(
          access.body.url,
          'Published testimonial screenshot',
        );
      },
    );

    await step(
      'Unpublishing, archiving, restoring, and deleting enforce the lifecycle',
      async () => {
        expectStatus(
          await admin.request(
            'POST',
            `/admin/testimonials/${screenshotId}/unpublish`,
          ),
          201,
        );
        expectStatus(
          await publicApi.request(
            'GET',
            `/testimonials/${screenshotId}/screenshot/access`,
          ),
          404,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/testimonials/${screenshotId}/publish`,
          ),
          201,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/testimonials/${screenshotId}/archive`,
          ),
          201,
        );
        expectStatus(
          await publicApi.request(
            'GET',
            `/testimonials/${screenshotId}/screenshot/access`,
          ),
          404,
        );
        const restore = await admin.request<any>(
          'POST',
          `/admin/testimonials/${screenshotId}/restore`,
        );
        expectStatus(restore, 201);
        assert(
          restore.body.status === 'DRAFT',
          'Restore must return an archived testimonial to draft',
        );
        expectStatus(
          await admin.request('DELETE', `/admin/testimonials/${textOnlyId}`),
          200,
        );
      },
    );
  },
};
