import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Governorates back the student-registration dropdown, which needs the complete
 * list in one page. The inherited default of 20 silently truncated Egypt's 27
 * governorates, so the ceiling is raised here.
 *
 * Overriding `limit` works because `@Max` registers CUSTOM_VALIDATION, which
 * class-validator de-duplicates by `(propertyName, type)` — the child's rule
 * evicts the parent's. (Contrast `@IsOptional`, which cannot be evicted this
 * way; see the note on CursorPaginationQueryDto.)
 */
export class GovernoratesQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum governorates per page. Defaults high enough to return every governorate.',
    default: 100,
    minimum: 1,
    maximum: 200,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  override limit = 100;
}
