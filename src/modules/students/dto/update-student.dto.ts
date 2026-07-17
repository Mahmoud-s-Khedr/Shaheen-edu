import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Whitelist-only: no role/status/nationalId/password fields are exposed
 * here. Combined with the global ValidationPipe({whitelist:true,
 * forbidNonWhitelisted:true}), any extra field in the request body is
 * rejected outright rather than silently ignored.
 */
export class UpdateStudentDto {
  @ApiProperty({ example: 'Ahmed Mohamed Ali', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiProperty({ example: 'Nasr City Center', required: false })
  @IsOptional()
  @IsString()
  center?: string;
}
