import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CatalogCoursesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Restrict results to one subject.' })
  @IsOptional()
  @IsString()
  subjectId?: string;
}
