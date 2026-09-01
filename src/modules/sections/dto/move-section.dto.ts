import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MoveSectionDto {
  @ApiProperty({ description: 'The lesson to move this section into' })
  @IsString()
  newLessonId!: string;

  @ApiPropertyOptional({
    description: 'Target sortOrder in the new parent; defaults to append',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;
}
