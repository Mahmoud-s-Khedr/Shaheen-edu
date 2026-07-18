import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderChapterItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReorderChapterDto {
  @ApiProperty({ description: 'The course whose chapters are being reordered' })
  @IsString()
  courseId!: string;

  @ApiProperty({ type: [ReorderChapterItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderChapterItemDto)
  @ArrayMinSize(1)
  items!: ReorderChapterItemDto[];
}
