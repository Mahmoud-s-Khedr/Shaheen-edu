import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AccessType } from '../types/roles.enum';

export class UpdateAccessTypeDto {
  @ApiProperty({ enum: AccessType })
  @IsEnum(AccessType)
  accessType!: AccessType;
}
