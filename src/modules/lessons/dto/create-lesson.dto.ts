import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/hierarchy/hierarchy.helper';

export class CreateLessonDto {
  @ApiProperty({ example: 'Lesson 1: Solving for X' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description:
      'Letters (a-z, A-Z) and digits separated by hyphens; derived from title if omitted',
    example: 'lesson-1-solving-for-x',
  })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsString()
  chapterId!: string;
}
