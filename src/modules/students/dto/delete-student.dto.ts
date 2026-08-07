import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteStudentDto {
  @ApiProperty({ description: 'Administrative reason for closing this account.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  deletionReason!: string;
}
