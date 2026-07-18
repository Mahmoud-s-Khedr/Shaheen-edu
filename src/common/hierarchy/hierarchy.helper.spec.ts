import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import {
  computeTwoPhaseRenumber,
  assertCompleteSequentialReorder,
  slugify,
  slugifyOrThrow,
  versionConflict,
} from './hierarchy.helper';

describe('slugify', () => {
  it('lowercases and dashes a plain title', () => {
    expect(slugify('Grade 10')).toBe('grade-10');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Algebra: Chapter 1 -- Linear Equations!')).toBe(
      'algebra-chapter-1-linear-equations',
    );
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });

  it('rejects a title with no slug-safe characters when deriving a slug', () => {
    expect(() => slugifyOrThrow('  --- !!!  ')).toThrow(AppException);
  });
});

describe('assertCompleteSequentialReorder', () => {
  const siblings = [
    { id: 'a', sortOrder: 1 },
    { id: 'b', sortOrder: 2 },
    { id: 'c', sortOrder: 3 },
  ];

  it('accepts one sequential entry for every sibling', () => {
    expect(() =>
      assertCompleteSequentialReorder(
        [
          { id: 'a', sortOrder: 3 },
          { id: 'b', sortOrder: 1 },
          { id: 'c', sortOrder: 2 },
        ],
        siblings,
      ),
    ).not.toThrow();
  });

  it('rejects partial and non-sequential requests', () => {
    expect(() =>
      assertCompleteSequentialReorder([{ id: 'a', sortOrder: 99 }], siblings),
    ).toThrow(AppException);
  });
});

describe('computeTwoPhaseRenumber', () => {
  it('produces a phase1 offset plan and a phase2 final plan matching input order', () => {
    const items = [
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 3 },
    ];

    const plan = computeTwoPhaseRenumber(items);

    expect(plan.phase1.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(plan.phase2).toEqual(items);

    // Phase 1 sort orders must be unique and far above any realistic sibling count.
    const phase1Orders = plan.phase1.map((p) => p.sortOrder);
    expect(new Set(phase1Orders).size).toBe(phase1Orders.length);
    expect(Math.min(...phase1Orders)).toBeGreaterThan(1000);
  });

  it('returns an empty plan for an empty input', () => {
    const plan = computeTwoPhaseRenumber([]);
    expect(plan.phase1).toEqual([]);
    expect(plan.phase2).toEqual([]);
  });
});

describe('versionConflict', () => {
  it('throws an AppException with 409 and ErrorCode.CONFLICT', () => {
    expect(() => versionConflict()).toThrow(AppException);
    try {
      versionConflict();
      fail('expected versionConflict to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const appException = error as AppException;
      expect(appException.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(appException.code).toBe(ErrorCode.CONFLICT);
    }
  });
});
