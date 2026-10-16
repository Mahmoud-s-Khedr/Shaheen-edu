import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBooleanString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SearchCursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';

function idList(value: unknown): unknown {
  return typeof value === 'string'
    ? [...new Set(value.split(',').map((id) => id.trim()))].sort()
    : value;
}

export class AccessibleLessonsQueryDto extends SearchCursorPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  subjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  courseId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated chapter IDs (OR). Combined with other filters using AND.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => idList(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  chapterIds?: string[];

  @ApiPropertyOptional({ enum: ['PUBLIC', 'FREE', 'ENTITLED'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'FREE', 'ENTITLED'])
  accessState?: 'PUBLIC' | 'FREE' | 'ENTITLED';

  @ApiPropertyOptional({ type: String, enum: ['true', 'false'] })
  @IsOptional()
  @IsBooleanString()
  @IsIn(['true', 'false'])
  isCompleted?: string;
}

export class AccessibleSectionsQueryDto extends AccessibleLessonsQueryDto {
  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated lesson IDs (OR). Combined with other filters using AND.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => idList(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  lessonIds?: string[];
}
