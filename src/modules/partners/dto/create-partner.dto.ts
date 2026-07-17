import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PartnerType } from '../../../common/types/roles.enum';

export class CreatePartnerDto {
  @ApiProperty({ example: 'partner@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: PartnerType, example: PartnerType.CONTENT_PUBLISHER })
  @IsEnum(PartnerType)
  partnerType!: PartnerType;

  @ApiProperty({ example: 'Acme Learning' })
  @IsString()
  displayName!: string;

  @ApiProperty({ example: 'Acme Learning LLC', required: false })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ example: '01098765432', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
