import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionAiExplanationRunMode } from '../../../common/types/roles.enum';

export class AiQuestionAnswerDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  selectedOptionIndexes?: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(10000, { each: true })
  acceptedAnswers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  gradingRubric?: string;
}

export class CreateAiQuestionExplanationRunDto {
  @ApiProperty({ enum: QuestionAiExplanationRunMode })
  @IsEnum(QuestionAiExplanationRunMode)
  mode!: QuestionAiExplanationRunMode;

  @ApiPropertyOptional({ type: AiQuestionAnswerDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AiQuestionAnswerDto)
  suppliedAnswer?: AiQuestionAnswerDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  additionalContext?: string;
}

export class ApplyAiQuestionExplanationRunDto {
  @ApiProperty() @IsBoolean() applyAnswer!: boolean;
  @ApiProperty() @IsBoolean() applyExplanation!: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RejectAiQuestionExplanationRunDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
