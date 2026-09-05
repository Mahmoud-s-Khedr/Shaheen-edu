import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/hierarchy/hierarchy.helper';
import { AccessType } from '../../../common/types/roles.enum';
import { IsEnum } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'Algebra Fundamentals' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description:
      'Letters (a-z, A-Z) and digits separated by hyphens; derived from title if omitted',
    example: 'algebra-fundamentals',
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
  subjectId!: string;

  @ApiProperty({ enum: [AccessType.PUBLIC, AccessType.FREE, AccessType.PAID] })
  @IsEnum([AccessType.PUBLIC, AccessType.FREE, AccessType.PAID])
  accessType!: AccessType;
}
