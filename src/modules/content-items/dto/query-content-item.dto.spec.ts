import { createRequestValidationPipe } from '../../../common/validation/request-validation.pipe';
import { QueryContentItemDto } from './query-content-item.dto';

describe('QueryContentItemDto placement filters', () => {
  const pipe = createRequestValidationPipe();
  const parse = (value: unknown) =>
    pipe.transform(value, {
      type: 'query',
      metatype: QueryContentItemDto,
    }) as Promise<QueryContentItemDto>;

  it.each(['courseIds', 'chapterIds', 'lessonIds', 'sectionIds'] as const)(
    'normalizes comma-separated and repeated %s',
    async (field) => {
      const result = await parse({ [field]: [' a,b ', 'b', ' c '] });
      expect(result[field]).toEqual(['a', 'b', 'c']);
      expect((await parse({ [field]: ' a,b,a ' }))[field]).toEqual(['a', 'b']);
    },
  );

  it.each(['', ' ', 'a,', ',a', 'a,,b', [], ['a', ''], 42, {}, ['a', 42]])(
    'rejects malformed IDs: %j',
    async (value) => {
      await expect(parse({ courseIds: value })).rejects.toMatchObject({
        status: 400,
      });
    },
  );

  it('accepts combined singular and plural filters and retains pagination defaults', async () => {
    const result = await parse({
      courseId: 'a',
      courseIds: 'b',
      sectionIds: 's',
    });
    expect(result).toMatchObject({
      courseId: 'a',
      courseIds: ['b'],
      sectionIds: ['s'],
      page: 1,
      limit: 20,
    });
  });
});
