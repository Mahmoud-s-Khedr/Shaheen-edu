import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { SLUG_PATTERN } from '../../../common/hierarchy/hierarchy.helper';
import { LocalizedOptionalTextDto, LocalizedTextDto } from '../../../common/dto/localized-text.dto';

export class UpdateAcademicGradeDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title?: LocalizedTextDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional({ type: LocalizedOptionalTextDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedOptionalTextDto)
  description?: LocalizedOptionalTextDto | null;

}
