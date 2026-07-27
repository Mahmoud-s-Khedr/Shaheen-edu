import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Arabic and English values returned to clients; English may be null for migrated records awaiting translation. */
export class LocalizedTextDto {
  @ApiProperty({ example: 'الصف الأول الثانوي' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  ar!: string;

  @ApiProperty({ example: 'First Secondary Grade' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  en!: string;
}

export class LocalizedOptionalTextDto {
  @ApiPropertyOptional({ example: 'وصف اختياري' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ar?: string;

  @ApiPropertyOptional({ example: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  en?: string;
}
