import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class VideoOutlineConceptInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}

export class VideoOutlineTopicInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  startSeconds?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  endSeconds?: number | null;

  @ApiProperty({ type: [VideoOutlineConceptInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VideoOutlineConceptInputDto)
  concepts!: VideoOutlineConceptInputDto[];
}

/** Replaces the complete optional outline for one VIDEO content item. */
export class ReplaceVideoOutlineDto {
  @ApiProperty({ type: [VideoOutlineTopicInputDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VideoOutlineTopicInputDto)
  topics!: VideoOutlineTopicInputDto[];
}
