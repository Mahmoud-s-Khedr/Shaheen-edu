import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ContentStatus } from '../../../common/types/roles.enum';

export class QueryCourseDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({
    enum: ContentStatus,
    description: 'Defaults to excluding ARCHIVED when omitted.',
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
