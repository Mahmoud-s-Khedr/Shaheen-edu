import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
export class CreateVideoDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
  @ApiPropertyOptional({
    description:
      'Required for teachers: existing draft VIDEO in an assigned course.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  contentItemId?: string;
}
