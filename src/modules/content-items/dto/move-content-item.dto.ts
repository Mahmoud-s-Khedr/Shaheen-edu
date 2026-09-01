import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
  Validate,
} from 'class-validator';
import {
  ContentPlacementTargetDto,
  ExactlyOneContentPlacementTargetConstraint,
} from './content-placement-target.dto';

export class MoveContentItemDto {
  @ApiProperty({ type: ContentPlacementTargetDto })
  @ValidateNested()
  @Type(() => ContentPlacementTargetDto)
  @Validate(ExactlyOneContentPlacementTargetConstraint)
  placement!: ContentPlacementTargetDto;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
