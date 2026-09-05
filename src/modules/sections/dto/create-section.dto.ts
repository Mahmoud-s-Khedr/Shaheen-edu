import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/hierarchy/hierarchy.helper';

export class CreateSectionDto {
  @ApiProperty({ example: 'Section 1: Introduction' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description:
      'Letters (a-z, A-Z) and digits separated by hyphens; derived from title if omitted',
    example: 'section-1-introduction',
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
  lessonId!: string;
}
