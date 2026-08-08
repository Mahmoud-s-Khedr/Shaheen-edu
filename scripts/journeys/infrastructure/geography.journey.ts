import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** Covers the complete managed-governorate lifecycle using unreferenced data. */
export const geographyJourney: JourneyDefinition = {
  id: 'INFRA-002',
  name: 'Managed geography lifecycle',
  category: 'infrastructure',
  dependsOn: ['AUTH-001'],
  async run({ clients, factory, step }) {
    const admin = clients.superAdmin;
    let governorateId = '';
    let centerId = '';
    await step(
      'Creating and listing an unreferenced governorate and center',
      async () => {
        const governorate = await admin.request<any>(
          'POST',
          '/admin/geography/governorates',
          {
            ar: `إدارة-${factory.runId}`,
            en: factory.title('Governorate'),
          },
        );
        expectStatus(governorate, 201);
        governorateId = governorate.body.id;
        const center = await admin.request<any>(
          'POST',
          `/admin/geography/governorates/${governorateId}/centers`,
          {
            ar: `إسلاميات-${factory.runId}`,
            en: factory.title('Center'),
          },
        );
        expectStatus(center, 201);
        centerId = center.body.id;
        const list = await admin.request<any>(
          'GET',
          `/admin/geography/governorates?q=${encodeURIComponent('ادارة')}`,
        );
        expectStatus(list, 200);
        assert(
          list.body.data.some(
            (item: any) =>
              item.id === governorateId &&
              item.centers.some((child: any) => child.id === centerId),
          ),
          'Created geography must be listed with its center',
        );
        assert(list.body.meta.total >= 1, 'Managed geography list must include pagination metadata');
        const publicList = await clients.public.request<any>(
          'GET',
          `/geography/governorates?q=${encodeURIComponent('اسلام')}`,
        );
        expectStatus(publicList, 200);
        assert(
          publicList.body.data.some(
            (item: any) =>
              item.id === governorateId &&
              item.centers.some((child: any) => child.id === centerId),
          ),
          'Public geography must list the created governorate and center',
        );
        assert(publicList.body.meta.total >= 1, 'Public geography list must include pagination metadata');
      },
    );
    await step('Deleting the unreferenced center and governorate', async () => {
      expectStatus(
        await admin.request('DELETE', `/admin/geography/centers/${centerId}`),
        200,
      );
      expectStatus(
        await admin.request(
          'DELETE',
          `/admin/geography/governorates/${governorateId}`,
        ),
        200,
      );
    });
  },
};
