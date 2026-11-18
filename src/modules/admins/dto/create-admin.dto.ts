import { Role } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  IsArray,
  ArrayUnique,
} from 'class-validator';

export class CreateAdminDto {
  @ApiPropertyOptional({
    enum: [Role.ADMIN, Role.TEACHER],
    default: Role.ADMIN,
  })
  @IsOptional()
  @IsIn([Role.ADMIN, Role.TEACHER])
  role?: 'ADMIN' | 'TEACHER';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  courseIds?: string[];

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
