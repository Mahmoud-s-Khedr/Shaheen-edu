import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveChapterDto {
  @ApiProperty({ description: 'The course to move this chapter into' })
  @IsString()
  newCourseId!: string;

  @ApiPropertyOptional({
    description: 'Target sortOrder in the new parent; defaults to append',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
