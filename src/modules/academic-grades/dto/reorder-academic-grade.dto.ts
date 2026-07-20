import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderAcademicGradeItemDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sortOrder!: number;

}

export class ReorderAcademicGradeDto {
  @ApiProperty({ type: [ReorderAcademicGradeItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderAcademicGradeItemDto)
  @ArrayMinSize(1)
  items!: ReorderAcademicGradeItemDto[];
}
