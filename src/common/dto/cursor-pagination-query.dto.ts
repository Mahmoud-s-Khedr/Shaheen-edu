import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Stable pagination for ordered catalog children. */
export class CursorPaginationQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor returned by the preceding page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

/**
 * Cursor pagination with optional text search.
 *
 * `q` deliberately lives here rather than on the base class: class-validator
 * de-duplicates inherited metadata by `(propertyName, type)`, so a subclass that
 * re-declares `q` as required cannot evict an inherited `@IsOptional` (which
 * registers CONDITIONAL_VALIDATION, a type no presence decorator produces). Any
 * DTO needing a mandatory `q` must extend `CursorPaginationQueryDto` and declare
 * the property itself.
 */
export class SearchCursorPaginationQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive text search. Search cursors are bound to this query.',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q?: string;
}
