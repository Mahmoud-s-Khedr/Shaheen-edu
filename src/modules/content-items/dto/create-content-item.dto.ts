import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AccessType, ContentItemType } from '../../../common/types/roles.enum';
import {
  ContentPlacementTargetDto,
  ExactlyOneContentPlacementTargetConstraint,
} from './content-placement-target.dto';
import { Validate } from 'class-validator';

export class CreateContentItemDto {
  @ApiProperty({ enum: ContentItemType })
  @IsEnum(ContentItemType)
  type!: ContentItemType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  textBody?: string;

  @ApiPropertyOptional({ description: 'HTTPS URL for EXTERNAL_LINK content' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  externalUrl?: string;

  @ApiPropertyOptional({ enum: AccessType, default: AccessType.INHERIT })
  @IsOptional()
  @IsEnum(AccessType)
  accessType?: AccessType;

  @ApiPropertyOptional({
    description: 'Estimated duration in seconds',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDuration?: number;

  @ApiProperty({ type: ContentPlacementTargetDto })
  @ValidateNested()
  @Type(() => ContentPlacementTargetDto)
  @Validate(ExactlyOneContentPlacementTargetConstraint)
  placement!: ContentPlacementTargetDto;
}
