import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ContentAccessLevel,
  ContentItemType,
} from '../../../common/types/roles.enum';

export class UpdateContentItemDto {
  @ApiPropertyOptional({ enum: ContentItemType })
  @IsOptional()
  @IsEnum(ContentItemType)
  type?: ContentItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  textBody?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  externalUrl?: string | null;

  @ApiPropertyOptional({ enum: ContentAccessLevel })
  @IsOptional()
  @IsEnum(ContentAccessLevel)
  accessLevel?: ContentAccessLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPreview?: boolean;

  @ApiPropertyOptional({ minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDuration?: number | null;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}
