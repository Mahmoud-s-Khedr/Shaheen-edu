import { createRequestValidationPipe } from '../../../common/validation/request-validation.pipe';
import { ListQuestionImportsDto } from './list-question-imports.dto';
import { questionImportListPredicate } from '../question-import-list.query';

const parse = (value: Record<string, unknown>) =>
  createRequestValidationPipe().transform(value, {
    type: 'query',
    metatype: ListQuestionImportsDto,
  }) as Promise<ListQuestionImportsDto>;

describe('ListQuestionImportsDto', () => {
  it('parses booleans without treating false as true, and splits statuses', async () => {
    expect(
      await parse({
        hasErrors: 'false',
        statuses: 'FAILED, TRANSCRIBING',
        page: '2',
      }),
    ).toMatchObject({
      hasErrors: false,
      statuses: ['FAILED', 'TRANSCRIBING'],
      page: 2,
      limit: 20,
    });
    expect((await parse({ hasErrors: 'true' })).hasErrors).toBe(true);
  });

  it.each([
    { status: 'INVALID' },
    { statuses: '' },
    { statuses: 'FAILED,' },
    { statuses: 'FAILED,INVALID' },
    { inputType: 'PDF' },
    { hasErrors: '1' },
    { hasErrors: 'yes' },
    ...[
      'courseId',
      'chapterId',
      'lessonId',
      'sectionId',
      'bankId',
      'sourceId',
      'createdById',
    ].map((key) => ({ [key]: '  ' })),
    { createdFrom: '2026-10-01' },
    { createdTo: '2026-10-01T00:00:00' },
    { createdFrom: '2026-02-30T00:00:00Z' },
  ])('rejects malformed query %j', async (value) => {
    await expect(parse(value)).rejects.toThrow();
  });

  it.each(
    ['createdFrom', 'createdTo'].flatMap((field) =>
      ['2026-W42-1T00:00:00Z', '2026-292T00:00:00Z', '20261019T00:00:00Z'].map(
        (value) => ({ [field]: value }),
      ),
    ),
  )('rejects ISO date forms unsupported by JavaScript %j', async (value) => {
    await expect(parse(value)).rejects.toThrow();
  });

  it.each([
    '2026-10-19T00:00:00Z',
    '2026-10-19T00:00:00.123Z',
    '2026-10-19T02:00:00+02:00',
    '2026-10-18T19:00:00-05:00',
  ])('accepts parseable calendar timestamps %s', async (value) => {
    const dto = await parse({ createdFrom: value });
    const predicate = questionImportListPredicate(dto);
    expect(predicate.values).toHaveLength(1);
    expect(predicate.values[0]).toBeInstanceOf(Date);
    expect(Number.isFinite((predicate.values[0] as Date).getTime())).toBe(true);
  });

  it('accepts timezone-aware timestamps and asset input type', async () => {
    const dto = await parse({
      inputType: 'ASSET',
      createdFrom: '2026-10-01T02:00:00+02:00',
      createdTo: '2026-10-02T00:00:00Z',
    });
    expect(() => questionImportListPredicate(dto)).not.toThrow();
  });

  it.each([
    { status: 'FAILED', statuses: 'FAILED' },
    { createdFrom: '2026-10-02T00:00:00Z', createdTo: '2026-10-01T00:00:00Z' },
    {
      createdFrom: '2026-10-01T02:00:00+02:00',
      createdTo: '2026-10-01T00:00:00Z',
    },
  ])('rejects conflicting query %j', async (value) => {
    const awaitedDto = await parse(value);
    expect(() => questionImportListPredicate(awaitedDto)).toThrow();
  });
});
