import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UploadAuthorizationDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(255) filename!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(255) mimeType!: string;
}
