import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderSectionItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class ReorderSectionDto {
  @ApiProperty({ description: 'The lesson whose sections are being reordered' })
  @IsString()
  lessonId!: string;

  @ApiProperty({ type: [ReorderSectionItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderSectionItemDto)
  @ArrayMinSize(1)
  items!: ReorderSectionItemDto[];
}
