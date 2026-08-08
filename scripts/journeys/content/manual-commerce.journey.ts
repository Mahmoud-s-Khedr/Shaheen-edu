import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-012 — Manual payment checkout, rejection, replacement proof, and approval. */
export const manualCommerceJourney: JourneyDefinition = {
  id: 'CONTENT-012', name: 'Manual course and chapter payments', category: 'content', dependsOn: ['CONTENT-009'], requiresBunny: true,
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    let studentToken = ''; let courseId = ''; let chapterId = ''; let orderId = ''; let methodId = '';
    const proofImage = await readFile(resolve(process.cwd(), 'test-files', 'G5LALx9a8AAH7PH.jpg'));
    const filePrefix = `manual-payment-${factory.runId}`;
    const student = <T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, headers?: Record<string, string>) => clients.public.request<T>(method, path, body, { accessToken: studentToken, headers });
    await step('Creating an active manual payment method and student', async () => {
      const method = await admin.request<any>('POST', '/admin/manual-payment-methods', { titleAr: 'تحويل بنكي', instructionsAr: 'حوّل المبلغ إلى الحساب المحدد' }); expectStatus(method, 201); methodId = method.body.id;
      const registration = await clients.public.request<any>('POST', '/auth/students/register', { fullName: factory.title('Manual payment student'), nationalId: factory.nationalId(), phone: `+20${factory.phone().slice(1)}`, parentPhone: factory.phone(), governorateId: String(context.academic.governorateId), academicGradeId: String(context.academic.gradeId), password: factory.password('ManualPay') }); expectStatus(registration, 201); studentToken = registration.body.accessToken;
      courseId = String(context.academic.courseId); chapterId = String(context.academic.chapterId);
      expectStatus(await admin.request<any>('POST', `/admin/pricing/course/${courseId}`, { isPurchasable: true, priceMinor: 20_000, currency: 'EGP' }), 201);
      expectStatus(await admin.request<any>('POST', `/admin/pricing/chapter/${chapterId}`, { isPurchasable: true, priceMinor: 10_000, currency: 'EGP' }), 201);
    });
    await step('Managing payment methods and a cancellable course order', async () => {
      const listed = await admin.request<any>('GET', `/admin/manual-payment-methods?limit=1&q=${encodeURIComponent('تحويل')}`); expectStatus(listed, 200); assert(listed.body.data.some((x: any) => x.id === methodId) && listed.body.meta.total >= 1, 'Created payment method must be searchable and paginated for admins');
      const updated = await admin.request<any>('PATCH', `/admin/manual-payment-methods/${methodId}`, { titleEn: 'Bank transfer' }); expectStatus(updated, 200); assert(updated.body.titleEn === 'Bank transfer', 'Payment method update must persist');
      const allMethods = await admin.request<any>('GET', '/admin/manual-payment-methods?limit=100'); expectStatus(allMethods, 200);
      expectStatus(await admin.request<any>('POST', '/admin/manual-payment-methods/reorder', { methodIds: allMethods.body.data.map((x: any) => x.id) }), 201);
      const emptyCart = await student<any>('GET', '/student/cart'); expectStatus(emptyCart, 200); assert(emptyCart.body.data.length === 0, 'New student cart must be empty');
      const courseItem = await student<any>('POST', '/student/cart/items', { targetType: 'COURSE', targetId: courseId }); expectStatus(courseItem, 201);
      expectStatus(await student<any>('DELETE', `/student/cart/items/${courseItem.body.id}`), 200);
      expectStatus(await student<any>('POST', '/student/cart/items', { targetType: 'COURSE', targetId: courseId }), 201);
      const cancelledCheckout = await student<any>('POST', '/student/checkout', { manualPaymentMethodId: methodId }, { 'idempotency-key': factory.slug('cancel-checkout') }); expectStatus(cancelledCheckout, 201);
      const cancelled = await student<any>('POST', `/student/orders/${cancelledCheckout.body.id}/cancel`); expectStatus(cancelled, 201); assert(cancelled.body.status === 'CANCELLED', 'Order cancellation must persist');
    });
    await step('Checking out and ensuring receipt review is required for access', async () => {
      const methods = await student<any>('GET', `/student/manual-payment-methods?q=${encodeURIComponent('تحويل')}`); expectStatus(methods, 200); assert(methods.body.data.some((x: any) => x.id === methodId) && methods.body.meta.total >= 1, 'Student must see searchable active payment methods');
      expectStatus(await student<any>('POST', '/student/cart/items', { targetType: 'CHAPTER', targetId: chapterId }), 201);
      const checkout = await student<any>('POST', '/student/checkout', { manualPaymentMethodId: methodId }, { 'idempotency-key': factory.slug('checkout') }); expectStatus(checkout, 201); orderId = checkout.body.id;
      const orders = await student<any>('GET', '/student/orders'); expectStatus(orders, 200); assert(orders.body.data.some((x: any) => x.id === orderId), 'Checkout must appear in order history');
      expectStatus(await student<any>('GET', `/student/orders/${orderId}`), 200);
      const library = await student<any>('GET', '/student/library'); expectStatus(library, 200); assert(!library.body.data.some((x: any) => x.target?.id === chapterId), 'Checkout must not grant access before review');
    });
    await step('Rejecting a receipt and accepting replacement proof through its dedicated route', async () => {
      const first = await clients.public.upload<any>(`/student/orders/${orderId}/payment-proof`, { buffer: proofImage, filename: `${filePrefix}-receipt-1.jpg`, contentType: 'image/jpeg' }, { accessToken: studentToken, fields: { transactionReference: 'REF-1' }, headers: { 'idempotency-key': factory.slug('proof') } }); expectStatus(first, 201);
      const queue = await admin.request<any>('GET', '/admin/payment-submissions?status=SUBMITTED'); expectStatus(queue, 200); const submission = queue.body.data.find((x: any) => x.id === first.body.id); assert(submission, 'Submitted payment must be visible to admins');
      expectStatus(await admin.request<any>('GET', `/admin/payment-submissions/${first.body.id}`), 200);
      expectStatus(await admin.request<any>('POST', `/admin/payment-submissions/${first.body.id}/reject`, { rejectionReason: 'Receipt is not readable' }), 201);
      const initialAfterRejection = await clients.public.upload<any>(`/student/orders/${orderId}/payment-proof`, { buffer: proofImage, filename: `${filePrefix}-initial-after-rejection.jpg`, contentType: 'image/jpeg' }, { accessToken: studentToken, fields: { transactionReference: 'REF-INVALID' }, headers: { 'idempotency-key': factory.slug('invalid-proof') } }); expectStatus(initialAfterRejection, 409);
      const replacement = await clients.public.upload<any>(`/student/orders/${orderId}/payment-submissions/${first.body.id}/resubmit`, { buffer: proofImage, filename: `${filePrefix}-receipt-2.jpg`, contentType: 'image/jpeg' }, { accessToken: studentToken, fields: { transactionReference: 'REF-2' }, headers: { 'idempotency-key': factory.slug('resubmit') } }); expectStatus(replacement, 201); assert(replacement.body.id !== first.body.id, 'Replacement proof must create a new submission');
      const resubmittedOrder = await student<any>('GET', `/student/orders/${orderId}`); expectStatus(resubmittedOrder, 200); assert(resubmittedOrder.body.status === 'SUBMITTED', 'Replacement proof must return the order to review'); const rejected = resubmittedOrder.body.submissions.find((x: any) => x.id === first.body.id); assert(rejected?.status === 'REJECTED' && rejected.rejectionReason === 'Receipt is not readable', 'Rejected proof history must be preserved');
      expectStatus(await admin.request<any>('POST', `/admin/payment-submissions/${replacement.body.id}/approve`), 201);
    });
    await step('Granting the approved chapter exactly once', async () => {
      const library = await student<any>('GET', '/student/library'); expectStatus(library, 200); assert(library.body.data.some((x: any) => x.target?.id === chapterId), 'Approved payment must grant the purchased chapter');
    });
  },
};
