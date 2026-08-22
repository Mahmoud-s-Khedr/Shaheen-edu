import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-020 — Optional, timestamped video topics and concepts. */
export const videoOutlineJourney: JourneyDefinition = {
  id: 'CONTENT-020',
  name: 'Optional video topics and concepts delivery',
  category: 'content',
  dependsOn: ['CONTENT-007'],
  requiresBunny: true,
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const videoAssetId = String(context.academic.coverageVideoAssetId ?? '');
    let contentItemId = '';

    await step(
      'Authoring an outline before attaching the ready video asset',
      async () => {
        assert(videoAssetId, 'CONTENT-007 must provide a ready video asset');
        const created = await admin.request<any>(
          'POST',
          '/admin/content-items',
          {
            type: 'VIDEO',
            title: factory.title('Outline video'),
            placement: { courseId },
          },
        );
        expectStatus(created, 201);
        contentItemId = created.body.id;
        context.created.contentItems.push(contentItemId);

        const saved = await admin.request<any>(
          'PUT',
          `/admin/content-items/${contentItemId}/video-outline`,
          {
            topics: [
              {
                title: 'Core idea',
                startSeconds: 0,
                concepts: [{ title: 'Force' }, { title: 'Mass' }],
              },
              { title: 'Worked example', concepts: [] },
            ],
          },
        );
        expectStatus(saved, 200);
        assert(
          saved.body.videoOutline?.length === 2 &&
            saved.body.videoOutline[0]?.sortOrder === 1 &&
            saved.body.videoOutline[0]?.concepts?.[1]?.title === 'Mass',
          'Outline replacement must preserve ordered topics and concepts',
        );

        const detail = await admin.request<any>(
          'GET',
          `/admin/content-items/${contentItemId}`,
        );
        expectStatus(detail, 200);
        assert(
          detail.body.videoOutline?.[0]?.startSeconds === 0,
          'Admin detail must expose the saved optional outline',
        );

        expectStatus(
          await admin.request(
            'PUT',
            `/admin/content-items/${contentItemId}/video-outline`,
            {
              topics: [
                {
                  title: 'Invalid range',
                  startSeconds: 3,
                  endSeconds: 3,
                  concepts: [],
                },
              ],
            },
          ),
          400,
        );
      },
    );

    await step(
      'Protecting outline authoring and publishing the video',
      async () => {
        expectStatus(
          await clients.public.request(
            'PUT',
            `/admin/content-items/${contentItemId}/video-outline`,
            { topics: [] },
          ),
          401,
        );
        expectStatus(
          await admin.request(
            'PUT',
            '/admin/content-items/missing-content/video-outline',
            { topics: [] },
          ),
          404,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/content-items/${contentItemId}/primary-asset`,
            { assetId: videoAssetId },
          ),
          201,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/content-items/${contentItemId}/publish`,
          ),
          201,
        );
      },
    );

    await step('Returning outlines only when the student opts in', async () => {
      const defaultDelivery = await clients.student.request<any>(
        'GET',
        `/student/content-items/${contentItemId}`,
      );
      expectStatus(defaultDelivery, 200);
      assert(
        !Object.hasOwn(defaultDelivery.body, 'videoOutline'),
        'The default video delivery shape must not include an outline',
      );

      const expandedDelivery = await clients.student.request<any>(
        'GET',
        `/student/content-items/${contentItemId}?includeVideoOutline=true`,
      );
      expectStatus(expandedDelivery, 200);
      assert(
        expandedDelivery.body.videoOutline?.length === 2 &&
          expandedDelivery.body.videoOutline[0]?.title === 'Core idea' &&
          expandedDelivery.body.videoOutline[0]?.concepts?.length === 2,
        'Opted-in delivery must return the full ordered outline',
      );

      const cleared = await admin.request<any>(
        'PUT',
        `/admin/content-items/${contentItemId}/video-outline`,
        { topics: [] },
      );
      expectStatus(cleared, 200);
      const emptyDelivery = await clients.student.request<any>(
        'GET',
        `/student/content-items/${contentItemId}?includeVideoOutline=true`,
      );
      expectStatus(emptyDelivery, 200);
      assert(
        Array.isArray(emptyDelivery.body.videoOutline) &&
          emptyDelivery.body.videoOutline.length === 0,
        'Opted-in delivery must return an empty outline after it is cleared',
      );
    });
  },
};
