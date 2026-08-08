import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CursorPaginationQueryDto,
  SearchCursorPaginationQueryDto,
} from './cursor-pagination-query.dto';
import { SearchPaginationQueryDto } from './pagination-query.dto';
import { StudentCatalogSearchDto } from '../../modules/catalog/dto/student-catalog-search.dto';
import { GovernoratesQueryDto } from '../../modules/geography/dto/query-governorates.dto';

/**
 * class-validator de-duplicates inherited metadata by `(propertyName, type)`.
 * A subclass can therefore evict an inherited CUSTOM_VALIDATION rule (`@Max`)
 * but not an inherited CONDITIONAL_VALIDATION one (`@IsOptional`). Both halves
 * of that behaviour are load-bearing here, so both are pinned.
 */
function errorsFor(cls: any, payload: object): string[] {
  return validateSync(plainToInstance(cls, payload) as object).map(
    (error) => error.property,
  );
}

describe('StudentCatalogSearchDto', () => {
  it('rejects a missing q rather than inheriting the base class optionality', () => {
    expect(errorsFor(StudentCatalogSearchDto, { subjectId: 'x' })).toContain('q');
  });

  it('rejects an empty q', () => {
    expect(errorsFor(StudentCatalogSearchDto, { subjectId: 'x', q: '' })).toContain('q');
  });

  it('accepts and trims a supplied q', () => {
    const dto = plainToInstance(StudentCatalogSearchDto, {
      subjectId: 'x',
      q: '  رياضيات  ',
    });
    expect(validateSync(dto as object)).toEqual([]);
    expect(dto.q).toBe('رياضيات');
  });

  it('defaults limit without requiring a cursor', () => {
    const dto = plainToInstance(StudentCatalogSearchDto, { subjectId: 'x', q: 'a' });
    expect(dto.limit).toBe(20);
    expect(dto.cursor).toBeUndefined();
  });
});

describe('CursorPaginationQueryDto', () => {
  it('does not accept q on the base class', () => {
    // Mirrors the global pipe (app.factory.ts:55) which sets whitelist +
    // forbidNonWhitelisted, so an undeclared `q` is rejected rather than ignored.
    const errors = validateSync(
      plainToInstance(CursorPaginationQueryDto, { q: 'x' }) as object,
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toEqual(['q']);
  });

  it('treats q as optional on the search variant', () => {
    const dto = plainToInstance(SearchCursorPaginationQueryDto, {});
    expect(validateSync(dto as object)).toEqual([]);
    expect(dto.q).toBeUndefined();
  });

  it('trims and validates q on the search variant', () => {
    const dto = plainToInstance(SearchCursorPaginationQueryDto, { q: '  إسلام ' });
    expect(validateSync(dto as object)).toEqual([]);
    expect(dto.q).toBe('إسلام');
    expect(errorsFor(SearchCursorPaginationQueryDto, { q: 'x'.repeat(121) })).toContain('q');
  });

  it('caps limit at 100', () => {
    expect(errorsFor(SearchCursorPaginationQueryDto, { limit: 101 })).toContain('limit');
  });
});

describe('SearchPaginationQueryDto', () => {
  it('defaults page and limit', () => {
    const dto = plainToInstance(SearchPaginationQueryDto, {});
    expect(validateSync(dto as object)).toEqual([]);
    expect([dto.page, dto.limit]).toEqual([1, 20]);
  });
});

describe('GovernoratesQueryDto', () => {
  it('defaults to a limit that fits every governorate', () => {
    const dto = plainToInstance(GovernoratesQueryDto, {});
    expect(validateSync(dto as object)).toEqual([]);
    expect(dto.limit).toBe(100);
  });

  it('raises the inherited maximum from 100 to 200', () => {
    expect(errorsFor(GovernoratesQueryDto, { limit: 150 })).toEqual([]);
    expect(errorsFor(GovernoratesQueryDto, { limit: 250 })).toContain('limit');
  });
});
