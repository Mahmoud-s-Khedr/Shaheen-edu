import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  QuestionImportInputType,
  QuestionImportStatus,
} from '../../../common/types/roles.enum';

export class ListQuestionImportsDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({
    enum: QuestionImportStatus,
    description: 'Single status; mutually exclusive with statuses.',
  })
  @IsOptional()
  @IsEnum(QuestionImportStatus)
  status?: QuestionImportStatus;

  @ApiPropertyOptional({
    type: String,
    example: 'AWAITING_REVIEW,FAILED',
    description: 'Comma-separated statuses; mutually exclusive with status.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((part: string) => part.trim())
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(QuestionImportStatus, { each: true })
  statuses?: QuestionImportStatus[];

  @ApiPropertyOptional({
    description: 'Target course, including all placement depths.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  courseId?: string;

  @ApiPropertyOptional({
    description:
      'Chapter placement or any descendant lesson/section placement.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  chapterId?: string;

  @ApiPropertyOptional({
    description: 'Lesson placement or any descendant section placement.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  lessonId?: string;

  @ApiPropertyOptional({
    description:
      'Exact section placement. Hierarchy filters must match the same placement.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  sectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  bankId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Submitting administrator ID.' })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MinLength(1)
  createdById?: string;

  @ApiPropertyOptional({ enum: QuestionImportInputType })
  @IsOptional()
  @IsEnum(QuestionImportInputType)
  inputType?: QuestionImportInputType;

  @ApiPropertyOptional({
    description:
      'Inclusive createdAt lower bound; ISO timestamp with timezone.',
    example: '2026-10-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  createdFrom?: string;

  @ApiPropertyOptional({
    description:
      'Exclusive createdAt upper bound; ISO timestamp with timezone.',
    example: '2026-10-20T00:00:00Z',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  createdTo?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'FAILED/COMPLETED_WITH_ERRORS status, failedItems > 0, or invalidItems > 0. False matches the inverse.',
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasErrors?: boolean;
}
