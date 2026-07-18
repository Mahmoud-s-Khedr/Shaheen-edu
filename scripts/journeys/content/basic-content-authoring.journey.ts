import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const contentJourney: JourneyDefinition = {
  id: 'CONTENT-002', name: 'Basic text and external-link content authoring', category: 'content', dependsOn: ['CONTENT-001'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin; const courseId = String(context.academic.courseId); const chapterId = String(context.academic.chapterId); let text: any; let link: any;
    await step('Creating text content at a course target', async () => { const r = await admin.request<any>('POST', '/admin/content-items', { type: 'TEXT', title: factory.title('Text item'), textBody: 'Synthetic journey text body', placement: { courseId } }); expectStatus(r, 201); assert(r.body.placement.courseId === courseId && r.body.placement.chapterId === null, 'Text must have exactly intended placement'); text = r.body; context.created.contentItems.push(text.id); });
    await step('Creating and validating HTTPS external-link content', async () => {
      const invalid = await admin.request<any>('POST', '/admin/content-items', { type: 'EXTERNAL_LINK', title: factory.title('Bad link'), externalUrl: 'http://invalid.example.test', placement: { courseId } }); expectStatus(invalid, 400);
      const r = await admin.request<any>('POST', '/admin/content-items', { type: 'EXTERNAL_LINK', title: factory.title('Link item'), externalUrl: 'https://example.test/resource', placement: { courseId } }); expectStatus(r, 201); assert(r.body.type === 'EXTERNAL_LINK' && r.body.placement.courseId === courseId, 'External link must persist'); link = r.body; context.created.contentItems.push(link.id);
      const multiple = await admin.request<any>('POST', '/admin/content-items', { type: 'TEXT', title: factory.title('Bad placement'), textBody: 'x', placement: { courseId, chapterId } }); expectStatus(multiple, 400);
    });
    await step('Reading, updating, and reordering placed content', async () => {
      const get = await admin.request<any>('GET', `/admin/content-items/${text.id}`); expectStatus(get, 200); assert(get.body.id === text.id, 'Read content must match');
      const update = await admin.request<any>('PATCH', `/admin/content-items/${text.id}`, { title: factory.title('Updated text'), version: text.version }); expectStatus(update, 200); text = update.body;
      const reorder = await admin.request<any>('POST', '/admin/content-items/reorder', { placement: { courseId }, items: [{ id: text.id, sortOrder: 2, version: text.placement.version }, { id: link.id, sortOrder: 1, version: link.placement.version }] }); expectStatus(reorder, 201);
    });
    await step('Moving, archiving, restoring, and deleting content', async () => {
      const moved = await admin.request<any>('POST', `/admin/content-items/${text.id}/move`, { placement: { chapterId }, version: text.placement.version + 1 }); expectStatus(moved, 201); text = moved.body; assert(text.placement.chapterId === chapterId && text.placement.courseId === null, 'Move must replace placement target');
      const archived = await admin.request<any>('POST', `/admin/content-items/${link.id}/archive`, { version: link.version }); expectStatus(archived, 201); assert(archived.body.status === 'ARCHIVED', 'Content must archive');
      const hidden = await admin.request<any>('GET', `/admin/content-items?courseId=${courseId}`); expectStatus(hidden, 200); assert(!hidden.body.data.some((entry: any) => entry.id === link.id), 'Archived content must be hidden by default');
      const restored = await admin.request<any>('POST', `/admin/content-items/${link.id}/restore`, { version: archived.body.version }); expectStatus(restored, 201); assert(restored.body.status === 'DRAFT', 'Content must restore to draft');
      const deleted = await admin.request<any>('DELETE', `/admin/content-items/${link.id}`, { version: restored.body.version }); expectStatus(deleted, 200);
    });
    await step('Rejecting content mutation by partner', async () => { const denied = await clients.partner.request<any>('POST', '/admin/content-items', { type: 'TEXT', title: factory.title('Denied'), textBody: 'x', placement: { courseId } }); expectStatus(denied, 403); });
  },
};
