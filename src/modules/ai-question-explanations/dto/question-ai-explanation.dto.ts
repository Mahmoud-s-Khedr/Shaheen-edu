import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QuestionExplanationDto } from '../../question-banks/dto/question-banks.dto';

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
  @ApiProperty({
    type: AiQuestionAnswerDto,
    description:
      'Verified answer supplied by an administrator. AI uses it only to generate an explanation.',
  })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => AiQuestionAnswerDto)
  suppliedAnswer!: AiQuestionAnswerDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  additionalContext?: string;
}

export class ApplyAiQuestionExplanationRunDto {
  @ApiProperty() @IsBoolean() applyAnswer!: boolean;
  @ApiProperty() @IsBoolean() applyExplanation!: boolean;
  @ApiPropertyOptional({
    type: QuestionExplanationDto,
    description:
      'Complete administrator-edited explanation, with all six sections. Requires applyExplanation=true. Omit to approve the generated explanation unchanged.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => QuestionExplanationDto)
  structuredExplanation?: QuestionExplanationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RejectAiQuestionExplanationRunDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) note!: string;
}
