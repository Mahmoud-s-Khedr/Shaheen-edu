import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
  Validate,
} from 'class-validator';
import {
  ContentPlacementTargetDto,
  ExactlyOneContentPlacementTargetConstraint,
} from './content-placement-target.dto';

export class ReorderContentItemEntryDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

  @ApiProperty({ minimum: 1, description: 'Current placement version' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReorderContentItemDto {
  @ApiProperty({ type: ContentPlacementTargetDto })
  @ValidateNested()
  @Type(() => ContentPlacementTargetDto)
  @Validate(ExactlyOneContentPlacementTargetConstraint)
  placement!: ContentPlacementTargetDto;

  @ApiProperty({ type: [ReorderContentItemEntryDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderContentItemEntryDto)
  @ArrayMinSize(1)
  items!: ReorderContentItemEntryDto[];
}
