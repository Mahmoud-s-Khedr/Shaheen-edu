import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  AccessType,
  ContentItemType,
  ContentStatus,
} from '../../../common/types/roles.enum';

function placementIds(value: unknown): unknown {
  const values = Array.isArray(value) ? value : [value];
  if (!values.every((id) => typeof id === 'string')) return value;
  return [
    ...new Set(
      values.flatMap((id: string) => id.split(',').map((part) => part.trim())),
    ),
  ];
}

export class QueryContentItemDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ enum: ContentItemType })
  @IsOptional()
  @IsEnum(ContentItemType)
  type?: ContentItemType;

  @ApiPropertyOptional({ enum: AccessType })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional({
    description:
      'Matches content attached to this course or its descendants; OR across all hierarchy filters. Merged with courseIds.',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated or repeated course IDs. Matches content attached to these targets or their descendants; OR across all hierarchy filters. Merged with courseId.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => placementIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  courseIds?: string[];

  @ApiPropertyOptional({
    description:
      'Matches content attached to this chapter or its descendants; OR across all hierarchy filters. Merged with chapterIds.',
  })
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated or repeated chapter IDs. Matches content attached to these targets or their descendants; OR across all hierarchy filters. Merged with chapterId.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => placementIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  chapterIds?: string[];

  @ApiPropertyOptional({
    description:
      'Matches content attached to this lesson or its descendants; OR across all hierarchy filters. Merged with lessonIds.',
  })
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated or repeated lesson IDs. Matches content attached to these targets or their descendants; OR across all hierarchy filters. Merged with lessonId.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => placementIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  lessonIds?: string[];

  @ApiPropertyOptional({
    description:
      'Matches content attached to this section or its descendants; OR across all hierarchy filters. Merged with sectionIds.',
  })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      'Comma-separated or repeated section IDs. Matches content attached to these targets or their descendants; OR across all hierarchy filters. Merged with sectionId.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => placementIds(value))
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  sectionIds?: string[];
}
