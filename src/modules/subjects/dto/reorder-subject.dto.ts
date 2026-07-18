import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReorderSubjectItemDto {
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

export class ReorderSubjectDto {
  @ApiProperty({
    description: 'The academic grade whose subjects are being reordered',
  })
  @IsString()
  academicGradeId!: string;

  @ApiProperty({ type: [ReorderSubjectItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ReorderSubjectItemDto)
  @ArrayMinSize(1)
  items!: ReorderSubjectItemDto[];
}
