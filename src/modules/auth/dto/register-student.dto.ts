import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterStudentDto {
  @ApiProperty({ example: 'Ahmed Mohamed Ali' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({
    description:
      '14-digit Egyptian National ID (never returned in responses). No example value is provided here deliberately, to avoid any placeholder that looks like a real ID.',
  })
  @IsString()
  @Matches(/^[\d\s-]{10,20}$/, {
    message: 'nationalId must be digits (spaces/dashes allowed)',
  })
  nationalId!: string;

  @ApiProperty({ example: '01012345678' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: '01098765432', description: "Parent's phone number" })
  @IsString()
  @IsNotEmpty()
  parentPhone!: string;

  @ApiProperty({ description: 'ID of a managed governorate' })
  @IsString()
  @IsNotEmpty()
  governorateId!: string;

  @ApiProperty({
    description: 'ID of the academic grade the student is enrolled in',
  })
  @IsString()
  @IsNotEmpty()
  academicGradeId!: string;

  @ApiProperty({ description: 'ID of a managed center in the selected governorate', required: false })
  @IsOptional()
  @IsString()
  centerId?: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
