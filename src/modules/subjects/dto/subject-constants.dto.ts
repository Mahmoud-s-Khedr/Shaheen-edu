import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSubjectConstantDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) key!: string;
  @ApiProperty() @IsString() @MaxLength(10000) value!: string;
}

export class UpdateSubjectConstantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  key?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  value?: string;
}

export class SubjectConstantDto {
  @ApiProperty() id!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty() key!: string;
  @ApiProperty() value!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class SubjectConstantsResponseDto {
  @ApiProperty({ type: [SubjectConstantDto] })
  data!: SubjectConstantDto[];
}
