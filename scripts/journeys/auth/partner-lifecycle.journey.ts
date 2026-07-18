import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const partnerJourney: JourneyDefinition = {
  id: 'AUTH-003', name: 'Partner lifecycle', category: 'auth', dependsOn: ['AUTH-002'],
  async run({ clients, context, factory, step }) {
    const email = factory.email('partner'); const password = factory.password('Partner');
    await step('Creating content-publisher partner', async () => {
      const r = await clients.admin.request<any>('POST', '/admin/partners', { email, password, partnerType: 'CONTENT_PUBLISHER', displayName: factory.title('Partner'), phone: factory.phone() }); expectStatus(r, 201); assert(r.body.partnerType === 'CONTENT_PUBLISHER', 'Partner type must persist'); context.partner = { id: r.body.id, email, password }; context.created.partners.push(r.body.id);
    });
    await step('Updating, logging in, and reading partner profile', async () => {
      const update = await clients.admin.request<any>('PATCH', `/admin/partners/${context.partner.id}`, { displayName: factory.title('Updated partner') }); expectStatus(update, 200);
      const login = await clients.partner.request<any>('POST', '/auth/partners/login', { email, password }); expectStatus(login, 201); assert(login.body.user.role === 'PARTNER', 'Partner login role must be PARTNER'); clients.partner.accessToken = login.body.accessToken; context.partner.accessToken = login.body.accessToken;
      const me = await clients.partner.request<any>('GET', '/partners/me'); expectStatus(me, 200); assert(me.body.id === context.partner.id, 'Partner profile must be structurally owned');
    });
    await step('Rejecting partner access to admin operations', async () => { const r = await clients.partner.request<any>('POST', '/admin/academic-grades', { title: factory.title('Forbidden') }); expectStatus(r, 403); });
    await step('Suspending and reactivating partner', async () => {
      const suspend = await clients.admin.request<any>('POST', `/admin/partners/${context.partner.id}/suspend`); expectStatus(suspend, 201); assert(suspend.body.status === 'SUSPENDED', 'Partner must be suspended');
      const rejected = await clients.partner.request<any>('POST', '/auth/partners/login', { email, password }); expectStatus(rejected, 401);
      const reactivate = await clients.admin.request<any>('POST', `/admin/partners/${context.partner.id}/reactivate`); expectStatus(reactivate, 201); assert(reactivate.body.status === 'ACTIVE', 'Partner must be active');
      const login = await clients.partner.request<any>('POST', '/auth/partners/login', { email, password }); expectStatus(login, 201); clients.partner.accessToken = login.body.accessToken; context.partner.accessToken = login.body.accessToken;
    });
  },
};
