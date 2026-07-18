import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface RenumberItem {
  id: string;
  sortOrder: number;
}

export interface TwoPhaseRenumberPlan {
  phase1: { id: string; sortOrder: number }[];
  phase2: { id: string; sortOrder: number }[];
}

// Offset chosen well above any realistic sibling count so phase 1 never
// collides with an untouched sibling's existing sortOrder.
const PHASE_ONE_OFFSET = 1_000_000;

/**
 * Sibling sortOrder is scoped-unique, so a single-pass renumber can collide
 * mid-transaction (e.g. swapping two positions). Moving every affected row
 * to a temporary offset first, then to its final value, avoids that without
 * a deferrable constraint.
 */
export function computeTwoPhaseRenumber(
  items: RenumberItem[],
): TwoPhaseRenumberPlan {
  return {
    phase1: items.map((item, index) => ({
      id: item.id,
      sortOrder: PHASE_ONE_OFFSET + index,
    })),
    phase2: items.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
  };
}

export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Rejects titles that cannot produce the required ASCII kebab-case slug. */
export function slugifyOrThrow(title: string): string {
  const slug = slugify(title);
  if (!slug) {
    throw new AppException(
      'Title must contain at least one letter or number when no slug is provided.',
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
  }
  return slug;
}

/** A reorder is a full replacement of one sibling scope, not a patch. */
export function assertCompleteSequentialReorder(
  requested: RenumberItem[],
  siblings: RenumberItem[],
): void {
  if (requested.length !== siblings.length) {
    throw new AppException(
      'Reorder must include every sibling in this scope.',
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
  }

  const siblingIds = new Set(siblings.map((item) => item.id));
  const ids = new Set(requested.map((item) => item.id));
  const orders = new Set(requested.map((item) => item.sortOrder));
  if (
    ids.size !== requested.length ||
    orders.size !== requested.length ||
    requested.some((item) => !siblingIds.has(item.id)) ||
    requested.some((item) => item.sortOrder < 1 || item.sortOrder > requested.length)
  ) {
    throw new AppException(
      'Reorder items must contain each sibling once with sortOrder values 1 through N.',
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    );
  }
}

export function versionConflict(): never {
  throw new AppException(
    'This record was modified by someone else. Refetch and retry.',
    HttpStatus.CONFLICT,
    ErrorCode.CONFLICT,
  );
}
