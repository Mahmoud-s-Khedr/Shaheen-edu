import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ContentAccessLevel,
  ContentItemType,
  ContentStatus,
} from '../../../common/types/roles.enum';

export class QueryContentItemDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ enum: ContentItemType })
  @IsOptional()
  @IsEnum(ContentItemType)
  type?: ContentItemType;

  @ApiPropertyOptional({ enum: ContentAccessLevel })
  @IsOptional()
  @IsEnum(ContentAccessLevel)
  accessLevel?: ContentAccessLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;
}
