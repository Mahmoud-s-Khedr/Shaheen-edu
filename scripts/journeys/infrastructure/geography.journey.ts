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
            ar: factory.title('Governorate'),
            en: factory.title('Governorate'),
          },
        );
        expectStatus(governorate, 201);
        governorateId = governorate.body.id;
        const center = await admin.request<any>(
          'POST',
          `/admin/geography/governorates/${governorateId}/centers`,
          {
            ar: factory.title('Center'),
            en: factory.title('Center'),
          },
        );
        expectStatus(center, 201);
        centerId = center.body.id;
        const list = await admin.request<any>(
          'GET',
          '/admin/geography/governorates',
        );
        expectStatus(list, 200);
        assert(
          list.body.some(
            (item: any) =>
              item.id === governorateId &&
              item.centers.some((child: any) => child.id === centerId),
          ),
          'Created geography must be listed with its center',
        );
        const publicList = await clients.public.request<any>(
          'GET',
          '/geography/governorates',
        );
        expectStatus(publicList, 200);
        assert(
          publicList.body.some(
            (item: any) =>
              item.id === governorateId &&
              item.centers.some((child: any) => child.id === centerId),
          ),
          'Public geography must list the created governorate and center',
        );
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
