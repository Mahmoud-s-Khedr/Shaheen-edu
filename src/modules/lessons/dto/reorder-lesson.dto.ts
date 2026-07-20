import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderLessonItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

}

export class ReorderLessonDto {
  @ApiProperty({ description: 'The chapter whose lessons are being reordered' })
  @IsString()
  chapterId!: string;

  @ApiProperty({ type: [ReorderLessonItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderLessonItemDto)
  @ArrayMinSize(1)
  items!: ReorderLessonItemDto[];
}
