import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class StudentLoginDto {
  @ApiProperty({ example: '01012345678', description: 'Student phone number' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class PartnerLoginDto {
  @ApiProperty({ example: 'partner@example.com' })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ParentLoginDto {
  @ApiProperty({
    description:
      "Student's 14-digit Egyptian National ID. No example value is provided here deliberately, to avoid any placeholder that looks like a real ID.",
  })
  @IsString()
  @IsNotEmpty()
  nationalId!: string;

  @ApiProperty({ example: '01098765432', description: "Parent's phone number" })
  @IsString()
  @IsNotEmpty()
  parentPhone!: string;
}
