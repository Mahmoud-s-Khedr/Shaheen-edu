import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SelectChildDto {
  @ApiProperty({ description: 'Student user id' })
  @IsString()
  @IsNotEmpty()
  studentUserId!: string;
}
