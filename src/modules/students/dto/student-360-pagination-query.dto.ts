import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Pagination with an optional support reason for audited Student-360 reads. */
export class Student360PaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Support reason recorded with sensitive Student-360 access.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
