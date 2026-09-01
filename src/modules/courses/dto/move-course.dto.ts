import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveCourseDto {
  @ApiProperty({ description: 'The subject to move this course into' })
  @IsString()
  newSubjectId!: string;

  @ApiPropertyOptional({
    description: 'Target sortOrder in the new parent; defaults to append',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
