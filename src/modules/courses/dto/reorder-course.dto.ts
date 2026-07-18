import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderCourseItemDto {
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

export class ReorderCourseDto {
  @ApiProperty({ description: 'The subject whose courses are being reordered' })
  @IsString()
  subjectId!: string;

  @ApiProperty({ type: [ReorderCourseItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderCourseItemDto)
  @ArrayMinSize(1)
  items!: ReorderCourseItemDto[];
}
