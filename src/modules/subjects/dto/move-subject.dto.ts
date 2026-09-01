import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveSubjectDto {
  @ApiProperty({ description: 'The academic grade to move this subject into' })
  @IsString()
  newAcademicGradeId!: string;

  @ApiPropertyOptional({
    description: 'Target sortOrder in the new parent; defaults to append',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
