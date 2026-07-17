import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePartnerDto {
  @ApiProperty({ example: 'Acme Learning', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({ example: 'Acme Learning LLC', required: false })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ example: '01098765432', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
