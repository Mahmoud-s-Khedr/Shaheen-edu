import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveLessonDto {
  @ApiProperty({ description: 'The chapter to move this lesson into' })
  @IsString()
  newChapterId!: string;

  @ApiPropertyOptional({
    description: 'Target sortOrder in the new parent; defaults to append',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
