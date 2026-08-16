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
    const courseId = String(context.academic.courseId);
    const subjectId = String(context.academic.subjectId);
    const publisherUserId = String(context.partner.id);
    let sourceId = '';
    let bankId = '';
    let questionId = '';

    await step(
      'Creating a publisher-backed source and a question bank',
      async () => {
        const invalid = await admin.request<any>(
          'POST',
          '/admin/question-banks/sources',
          {
            type: 'CONTENT_PUBLISHER',
            title: factory.localizedTitle('Invalid publisher source'),
          },
        );
        expectStatus(invalid, 400);

        const source = await admin.request<any>(
          'POST',
          '/admin/question-banks/sources',
          {
            type: 'CONTENT_PUBLISHER',
            title: factory.localizedTitle('Publisher source'),
            note: factory.localizedTitle('Synthetic journey provenance'),
            publisherUserId,
          },
        );
        expectStatus(source, 201);
        sourceId = source.body.id;
        context.created.questionSources.push(sourceId);
        assert(
          source.body.publisherUserId === publisherUserId &&
            typeof source.body.publisherName === 'string',
          'Source must retain its supplying publisher ID and display name',
        );

        const bank = await admin.request<any>('POST', '/admin/question-banks', {
          subjectId,
          title: factory.title('Question bank'),
          description: 'Synthetic authoring bank',
        });
        expectStatus(bank, 201);
        bankId = bank.body.id;
        context.created.questionBanks.push(bankId);
        assert(
          bank.body.subjectId === subjectId &&
            typeof bank.body.subjectName === 'string',
          'Question bank must return its subject ID and name',
        );

        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/sources/${sourceId}/publish`,
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/${bankId}/publish`,
          ),
          201,
        );
      },
    );

    await step(
      'Creating a single-choice question and enforcing its option constraints',
      async () => {
        const questionContext = await admin.request<any>(
          'POST',
          '/admin/questions/contexts',
          {
            type: 'TEXT',
            title: factory.title('Disposable question context'),
            body: 'A short reusable context for API acceptance coverage.',
            languageCode: 'en',
          },
        );
        expectStatus(questionContext, 201);
        const contexts = await admin.request<any>(
          'GET',
          '/admin/questions/contexts',
        );
        expectStatus(contexts, 200);
        assert(
          contexts.body.some(
            (item: any) => item.id === questionContext.body.id,
          ),
          'Created contexts must be listed',
        );
        const updatedContext = await admin.request<any>(
          'PATCH',
          `/admin/questions/contexts/${questionContext.body.id}`,
          { title: factory.title('Updated disposable context') },
        );
        expectStatus(updatedContext, 200);
        expectStatus(
          await admin.request<any>(
            'DELETE',
            `/admin/questions/contexts/${questionContext.body.id}`,
          ),
          200,
        );

        const question = await admin.request<any>('POST', '/admin/questions', {
          bankId,
          sourceId,
          courseId,
          placements: [{ chapterId }],
          body: 'Which synthetic option is correct?',
          explanation: 'This is a generated journey explanation.',
        });
        expectStatus(question, 201);
        questionId = question.body.id;
        context.created.questions.push(questionId);
        assert(
          question.body.type === 'SINGLE_CHOICE' &&
            question.body.bankId === bankId &&
            typeof question.body.bankName === 'string' &&
            question.body.scope.courseId === courseId &&
            typeof question.body.scope.courseName === 'string' &&
            question.body.placements.some(
              (placement: any) =>
                placement.chapterId === chapterId &&
                typeof placement.chapterName === 'string',
            ),
          'Question must return paired bank, scope, and placement labels',
        );

        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${questionId}/submit`,
          ),
          409,
        );
        const first = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/options`,
          { body: 'Correct option', isCorrect: true },
        );
        expectStatus(first, 201);
        const second = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/options`,
          { body: 'Alternative option', isCorrect: false },
        );
        expectStatus(second, 201);
        assert(
          second.body.options.length === 2 &&
            second.body.options.filter((option: any) => option.isCorrect)
              .length === 1,
          'Question must retain exactly one correct option',
        );
      },
    );

    await step(
      'Submitting, reviewing, rejecting, revising, and publishing the question',
      async () => {
        const submitted = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/submit`,
        );
        expectStatus(submitted, 201);
        assert(
          submitted.body.status === 'IN_REVIEW',
          'Valid question must enter review',
        );

        const revised = await admin.request<any>(
          'PATCH',
          `/admin/questions/${questionId}`,
          { body: 'Which revised synthetic option is correct?' },
        );
        expectStatus(revised, 200);
        assert(
          revised.body.status === 'IN_REVIEW',
          'Review edits must retain review status',
        );

        const rejected = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/reject`,
          { reviewNote: 'Please clarify the wording.' },
        );
        expectStatus(rejected, 201);
        assert(
          rejected.body.status === 'REJECTED' &&
            rejected.body.reviewNote === 'Please clarify the wording.',
          'Reviewer rejection must retain its note',
        );

        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${questionId}/submit`,
          ),
          201,
        );
        const published = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/publish`,
        );
        expectStatus(published, 201);
        assert(
          published.body.status === 'PUBLISHED' && published.body.publishedAt,
          'Question must publish after review',
        );
      },
    );

    await step(
      'Protecting published dependencies and archiving the question',
      async () => {
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/sources/${sourceId}/archive`,
          ),
          409,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-banks/${bankId}/archive`,
          ),
          409,
        );
        const denied = await clients.partner.request<any>(
          'POST',
          '/admin/questions',
          {
            bankId,
            sourceId,
            courseId,
            placements: [{ chapterId }],
            body: 'Denied question',
            explanation: 'Denied.',
          },
        );
        expectStatus(denied, 403);

        const archived = await admin.request<any>(
          'POST',
          `/admin/questions/${questionId}/archive`,
        );
        expectStatus(archived, 201);
        assert(archived.body.status === 'ARCHIVED', 'Question must archive');
        const listed = await admin.request<any>(
          'GET',
          `/admin/questions?chapterId=${chapterId}&q=${encodeURIComponent('revised')}`,
        );
        expectStatus(listed, 200);
        assert(
          !listed.body.data.some(
            (question: any) => question.id === questionId,
          ) && listed.body.meta.total >= 0,
          'Archived questions must be hidden from searchable paginated lists',
        );
      },
    );
  },
};
