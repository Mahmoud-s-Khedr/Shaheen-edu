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
          { name: factory.title('Governorate') },
        );
        expectStatus(governorate, 201);
        governorateId = governorate.body.id;
        const center = await admin.request<any>(
          'POST',
          `/admin/geography/governorates/${governorateId}/centers`,
          { name: factory.title('Center') },
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
