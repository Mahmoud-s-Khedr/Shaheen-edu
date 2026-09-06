import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ContentStatus } from '../../../common/types/roles.enum';

const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTestimonialDto {
  @ApiPropertyOptional({
    description:
      'Written review text. Required when no screenshot is supplied.',
    maxLength: 5000,
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  reviewText?: string | null;

  @ApiPropertyOptional({
    description: 'Optional name or attribution supplied with the review.',
    maxLength: 160,
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  reviewerName?: string | null;

  @ApiPropertyOptional({
    description: 'ID of a ready IMAGE asset containing a review screenshot.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  screenshotAssetId?: string | null;

  @ApiPropertyOptional({
    description:
      'Required for screenshot testimonials. Describes the image for visitors who cannot view it.',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  screenshotAltText?: string | null;
}

export class UpdateTestimonialDto extends CreateTestimonialDto {}

export class QueryTestimonialDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ContentStatus,
    description: 'Defaults to excluding archived testimonials.',
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class ReorderTestimonialItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class ReorderTestimonialDto {
  @ApiProperty({ type: [ReorderTestimonialItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderTestimonialItemDto)
  @ArrayMinSize(1)
  items!: ReorderTestimonialItemDto[];
}
