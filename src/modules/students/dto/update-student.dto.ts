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

  @ApiProperty({
    example: '01098765432',
    description: "Parent's phone number",
    required: false,
  })
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiProperty({ description: 'ID of a managed governorate', required: false })
  @IsOptional()
  @IsString()
  governorateId?: string;

  @ApiProperty({
    description: 'ID of a managed center in the student governorate',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  centerId?: string | null;

  @ApiProperty({ required: false, description: 'Published academic grade ID' })
  @IsOptional()
  @IsString()
  academicGradeId?: string;
}
