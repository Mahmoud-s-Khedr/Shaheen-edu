import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SLUG_PATTERN } from '../../../common/hierarchy/hierarchy.helper';
import {
  LocalizedOptionalTextDto,
  LocalizedTextDto,
} from '../../../common/dto/localized-text.dto';

export class CreateAcademicGradeDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;

  @ApiPropertyOptional({
    description:
      'Letters (a-z, A-Z) and digits separated by hyphens; derived from title if omitted',
    example: 'grade-10',
  })
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional({ type: LocalizedOptionalTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedOptionalTextDto)
  description?: LocalizedOptionalTextDto;
}
