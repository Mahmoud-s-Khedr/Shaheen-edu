import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CatalogSubjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict results to one academic grade.',
  })
  @IsOptional()
  @IsString()
  academicGradeId?: string;
}
