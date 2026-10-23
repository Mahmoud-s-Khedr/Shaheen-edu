import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  FormQuestionType,
  FormRespondentType,
  FormStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class FormOptionInputDto {
  @ApiPropertyOptional({
    description:
      'Existing option ID when updating a draft. Omit for new options.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id?: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;
}

export class FormQuestionInputDto {
  @ApiPropertyOptional({
    description:
      'Existing question ID when updating a draft. Omit for new questions.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  id?: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  title!: string;

  @ApiProperty({ enum: FormQuestionType })
  @IsEnum(FormQuestionType)
  type!: FormQuestionType;

  @ApiPropertyOptional({ default: false })
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.required)
  @IsBoolean()
  required = false;

  @ApiPropertyOptional({
    type: [FormOptionInputDto],
    description:
      'Array order controls display order. Choice questions require 2–50 options; text questions cannot have options.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => FormOptionInputDto)
  options?: FormOptionInputDto[];
}

export class CreateFormDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  confirmationMessage?: string | null;

  @ApiProperty({
    type: [FormQuestionInputDto],
    description: '1–100 questions in display order.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormQuestionInputDto)
  questions!: FormQuestionInputDto[];
}

export class UpdateFormDto extends PartialType(CreateFormDto, {
  skipNullProperties: false,
}) {}

export class FormAnswerInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  questionId!: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  text?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Exactly one ID for SINGLE_CHOICE; one or more for MULTIPLE_CHOICE.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  optionIds?: string[];
}

export class SubmitFormDto {
  @ApiProperty({
    type: [FormAnswerInputDto],
    description:
      'Omit optional unanswered questions. All answers are saved atomically.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormAnswerInputDto)
  answers!: FormAnswerInputDto[];
}

export class QueryFormsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;
}

export class FormResultsQueryDto {
  @ApiPropertyOptional({ enum: FormRespondentType })
  @IsOptional()
  @IsEnum(FormRespondentType)
  respondentType?: FormRespondentType;
}

export class QueryFormSubmissionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FormRespondentType })
  @IsOptional()
  @IsEnum(FormRespondentType)
  respondentType?: FormRespondentType;
}
