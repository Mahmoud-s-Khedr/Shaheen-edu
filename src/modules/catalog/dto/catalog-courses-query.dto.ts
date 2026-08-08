import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CatalogCoursesQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ description: 'Restrict results to one subject.' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}
