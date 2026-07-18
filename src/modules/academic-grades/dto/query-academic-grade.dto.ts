import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ContentStatus } from '../../../common/types/roles.enum';

export class QueryAcademicGradeDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ContentStatus,
    description: 'Defaults to excluding ARCHIVED when omitted.',
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
