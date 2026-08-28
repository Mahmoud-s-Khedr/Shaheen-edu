import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateQuestionHighlightDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100000) selectedText!: string;
  @ApiProperty({ minimum: 0 }) @Type(() => Number) @IsInt() @Min(0) startOffset!: number;
  @ApiProperty({ minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) endOffset!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) color?: string;
}

export class QuestionHighlightDto {
  @ApiProperty() id!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() selectedText!: string;
  @ApiProperty() startOffset!: number;
  @ApiProperty() endOffset!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) color!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CreateNotebookPageDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @ApiProperty() @IsString() @MaxLength(1000000) content!: string;
}

export class UpdateNotebookPageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000000) content?: string;
}

export class NotebookPageDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
