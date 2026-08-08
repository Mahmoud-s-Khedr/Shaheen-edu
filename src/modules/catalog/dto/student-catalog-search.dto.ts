import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CursorPaginationQueryDto } from '../../../common/dto/cursor-pagination-query.dto';

export class StudentCatalogSearchDto extends CursorPaginationQueryDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ description: 'Arabic-aware catalog search text.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q!: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated subset of CHAPTER, LESSON, SECTION. Defaults to all.',
    example: 'CHAPTER,LESSON',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  types?: string;
}
