import { AssessmentAttributionRole } from '@prisma/client';
import { buildAttributionRows } from '../../../scripts/backfill-assessment-attribution';

describe('assessment attribution backfill rows', () => {
  it('creates frozen publisher attribution where the original source remains available', () => {
    const result = buildAttributionRows(
      [{ id: 'snapshot-1', sourceQuestionId: 'question-1' }],
      new Map([
        [
          'question-1',
          {
            id: 'source-1',
            titleAr: 'Source',
            type: 'BOOK',
            publisherUserId: 'publisher-1',
            publisher: { displayName: 'Publisher' },
          },
        ],
      ]),
    );
    expect(result).toMatchObject({
      resolvable: 1,
      unknown: 0,
      data: [
        expect.objectContaining({
          assessmentQuestionId: 'snapshot-1',
          sourceId: 'source-1',
          role: AssessmentAttributionRole.PRIMARY,
        }),
      ],
    });
  });

  it('records an explicit unknown-legacy attribution instead of dropping historical snapshots', () => {
    const result = buildAttributionRows(
      [{ id: 'snapshot-1', sourceQuestionId: 'deleted-question' }],
      new Map(),
    );
    expect(result).toMatchObject({
      resolvable: 0,
      unknown: 1,
      data: [
        expect.objectContaining({
          role: AssessmentAttributionRole.UNKNOWN_LEGACY,
          sourceId: null,
        }),
      ],
    });
  });
});
