import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-021 — Admin AI re-answer endpoint contract without a live provider call. */
export const aiQuestionExplanationsJourney: JourneyDefinition = {
  id: 'CONTENT-021',
  name: 'AI question explanation and re-answer review contract',
  category: 'content',
  dependsOn: ['CONTENT-006'],
  async run({ clients, context, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);
    let questionId = '';

    await step('Creating an eligible draft question for AI re-answer validation', async () => {
      const question = await admin.request<any>('POST', '/admin/questions', {
        bankId: String(context.created.questionBanks.at(-1)),
        sourceId: String(context.created.questionSources.at(-1)),
        courseId,
        placements: [{ chapterId }],
        body: 'Which synthetic fact is correct?',
        explanation: 'A human-authored compatibility explanation.',
      });
      expectStatus(question, 201);
      questionId = question.body.id;
      context.created.questions.push(questionId);
      const first = await admin.request<any>('POST', `/admin/questions/${questionId}/options`, { body: 'Correct fact', isCorrect: true });
      const second = await admin.request<any>('POST', `/admin/questions/${questionId}/options`, { body: 'Incorrect fact', isCorrect: false });
      expectStatus(first, 201);
      expectStatus(second, 201);
    });

    await step('Validating re-answer input and retained-run routes without calling the provider', async () => {
      // A grounded request must provide a type-valid answer. This reaches the
      // new service but is rejected before it can make an OpenRouter call.
      expectStatus(await admin.request('POST', `/admin/questions/${questionId}/ai/re-answer`, { mode: 'GROUNDED' }), 400);
      expectStatus(await admin.request('POST', `/admin/questions/${questionId}/ai/re-answer`, {
        mode: 'INFER', suppliedAnswer: { selectedOptionIndexes: [0] },
      }), 400);

      const listed = await admin.request<any>('GET', `/admin/questions/${questionId}/ai/re-answer`);
      expectStatus(listed, 200);
      assert(Array.isArray(listed.body) && listed.body.length === 0, 'A question without successful AI requests must have no review runs');
      expectStatus(await admin.request('GET', `/admin/questions/${questionId}/ai/re-answer/missing-run`), 404);
      expectStatus(await admin.request('POST', `/admin/questions/${questionId}/ai/re-answer/missing-run/apply`, { applyAnswer: true, applyExplanation: true }), 404);
      expectStatus(await admin.request('POST', `/admin/questions/${questionId}/ai/re-answer/missing-run/reject`, { note: 'Synthetic rejection' }), 404);
    });

    await step('Protecting AI re-answer endpoints from non-admin access', async () => {
      expectStatus(await clients.partner.request('GET', `/admin/questions/${questionId}/ai/re-answer`), 403);
      expectStatus(await clients.partner.request('POST', `/admin/questions/${questionId}/ai/re-answer`, { mode: 'INFER' }), 403);
      expectStatus(await clients.partner.request('POST', `/admin/questions/${questionId}/ai/re-answer/missing-run/apply`, { applyAnswer: true, applyExplanation: false }), 403);
    });
  },
};
