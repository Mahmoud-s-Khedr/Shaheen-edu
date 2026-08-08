import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CatalogSubjectsQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Restrict results to one academic grade.',
  })
  @IsOptional()
  @IsString()
  academicGradeId?: string;
}
