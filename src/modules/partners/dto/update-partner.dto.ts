import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePartnerDto {
  @ApiProperty({ example: 'Acme Learning', required: false })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({
    type: String,
    example: 'Acme Learning LLC',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  legalName?: string | null;

  @ApiProperty({
    type: String,
    example: '01098765432',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
