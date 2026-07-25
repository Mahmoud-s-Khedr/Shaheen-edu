import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-006 — Manual source, bank, and single-choice question authoring. */
export const questionBankAuthoringJourney: JourneyDefinition = {
  id: 'CONTENT-006',
  name: 'Manual question-bank authoring and review lifecycle',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-003'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const chapterId = String(context.academic.chapterId);
    const publisherUserId = String(context.partner.id);
    let sourceId = '';
    let bankId = '';
    let questionId = '';

    await step('Creating a publisher-backed source and a question bank', async () => {
      const invalid = await admin.request<any>('POST', '/admin/question-banks/sources', {
        type: 'CONTENT_PUBLISHER', title: factory.title('Invalid publisher source'),
      });
      expectStatus(invalid, 400);

      const source = await admin.request<any>('POST', '/admin/question-banks/sources', {
        type: 'CONTENT_PUBLISHER', title: factory.title('Publisher source'), note: 'Synthetic journey provenance', publisherUserId,
      });
      expectStatus(source, 201);
      sourceId = source.body.id;
      context.created.questionSources.push(sourceId);
      assert(source.body.publisherUserId === publisherUserId, 'Source must retain its supplying publisher');

      const bank = await admin.request<any>('POST', '/admin/question-banks', {
        title: factory.title('Question bank'), description: 'Synthetic authoring bank',
      });
      expectStatus(bank, 201);
      bankId = bank.body.id;
      context.created.questionBanks.push(bankId);

      expectStatus(await admin.request<any>('POST', `/admin/question-banks/sources/${sourceId}/publish`), 201);
      expectStatus(await admin.request<any>('POST', `/admin/question-banks/${bankId}/publish`), 201);
    });

    await step('Creating a single-choice question and enforcing its option constraints', async () => {
      const question = await admin.request<any>('POST', '/admin/questions', {
        bankId, sourceId, chapterId, body: 'Which synthetic option is correct?', explanation: 'This is a generated journey explanation.',
      });
      expectStatus(question, 201);
      questionId = question.body.id;
      context.created.questions.push(questionId);
      assert(question.body.type === 'SINGLE_CHOICE' && question.body.scope.chapterId === chapterId, 'Question must be single-choice and inherit chapter scope');

      expectStatus(await admin.request<any>('POST', `/admin/questions/${questionId}/submit`), 409);
      const first = await admin.request<any>('POST', `/admin/questions/${questionId}/options`, { body: 'Correct option', isCorrect: true });
      expectStatus(first, 201);
      const second = await admin.request<any>('POST', `/admin/questions/${questionId}/options`, { body: 'Alternative option', isCorrect: false });
      expectStatus(second, 201);
      assert(second.body.options.length === 2 && second.body.options.filter((option: any) => option.isCorrect).length === 1, 'Question must retain exactly one correct option');
    });

    await step('Submitting, reviewing, rejecting, revising, and publishing the question', async () => {
      const submitted = await admin.request<any>('POST', `/admin/questions/${questionId}/submit`);
      expectStatus(submitted, 201);
      assert(submitted.body.status === 'IN_REVIEW', 'Valid question must enter review');

      const revised = await admin.request<any>('PATCH', `/admin/questions/${questionId}`, { body: 'Which revised synthetic option is correct?' });
      expectStatus(revised, 200);
      assert(revised.body.status === 'IN_REVIEW', 'Review edits must retain review status');

      const rejected = await admin.request<any>('POST', `/admin/questions/${questionId}/reject`, { reviewNote: 'Please clarify the wording.' });
      expectStatus(rejected, 201);
      assert(rejected.body.status === 'REJECTED' && rejected.body.reviewNote === 'Please clarify the wording.', 'Reviewer rejection must retain its note');

      expectStatus(await admin.request<any>('POST', `/admin/questions/${questionId}/submit`), 201);
      const published = await admin.request<any>('POST', `/admin/questions/${questionId}/publish`);
      expectStatus(published, 201);
      assert(published.body.status === 'PUBLISHED' && published.body.publishedAt, 'Question must publish after review');
    });

    await step('Protecting published dependencies and archiving the question', async () => {
      expectStatus(await admin.request<any>('POST', `/admin/question-banks/sources/${sourceId}/archive`), 409);
      expectStatus(await admin.request<any>('POST', `/admin/question-banks/${bankId}/archive`), 409);
      const denied = await clients.partner.request<any>('POST', '/admin/questions', { bankId, sourceId, chapterId, body: 'Denied question', explanation: 'Denied.' });
      expectStatus(denied, 403);

      const archived = await admin.request<any>('POST', `/admin/questions/${questionId}/archive`);
      expectStatus(archived, 201);
      assert(archived.body.status === 'ARCHIVED', 'Question must archive');
      const listed = await admin.request<any>('GET', `/admin/questions?chapterId=${chapterId}`);
      expectStatus(listed, 200);
      assert(!listed.body.data.some((question: any) => question.id === questionId), 'Archived questions must be hidden from normal lists');
    });
  },
};
