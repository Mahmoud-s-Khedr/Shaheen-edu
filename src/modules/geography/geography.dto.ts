import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GeographyNameDto {
  @ApiProperty({ example: 'القاهرة' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ar!: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  en!: string;
}
