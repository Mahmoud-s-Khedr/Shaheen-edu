import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  ContentStatus,
  QuestionAnswerProvenance,
  QuestionContentBlockType,
  QuestionContextType,
  QuestionSourceType,
  QuestionStatus,
  QuestionType,
} from '../../../common/types/roles.enum';
import {
  LocalizedOptionalTextDto,
  LocalizedTextDto,
} from '../../../common/dto/localized-text.dto';

export class CreateQuestionSourceDto {
  @ApiProperty({ enum: QuestionSourceType })
  @IsEnum(QuestionSourceType)
  type!: QuestionSourceType;
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title!: LocalizedTextDto;
  @ApiPropertyOptional({ type: LocalizedOptionalTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedOptionalTextDto)
  note?: LocalizedOptionalTextDto;
  @ApiPropertyOptional({
    description: 'Required only for CONTENT_PUBLISHER sources',
  })
  @IsOptional()
  @IsString()
  publisherUserId?: string;
}
export class UpdateQuestionSourceDto {
  @ApiPropertyOptional({ enum: QuestionSourceType })
  @IsOptional()
  @IsEnum(QuestionSourceType)
  type?: QuestionSourceType;
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  title?: LocalizedTextDto;
  @ApiPropertyOptional({ type: LocalizedOptionalTextDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedOptionalTextDto)
  note?: LocalizedOptionalTextDto | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  publisherUserId?: string | null;
}
export class CreateQuestionBankDto {
  @ApiProperty() @IsString() subjectId!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
export class UpdateQuestionBankDto {
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
export class QuestionPlacementDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}
export class QuestionExplanationDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10000) keywords!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  eliminationStrategy!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  whyCorrect!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  generalRule!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(10000) whatIf!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  commonMistakes!: string;
}
export class QuestionContentBlockDto {
  @ApiProperty({ enum: QuestionContentBlockType })
  @IsEnum(QuestionContentBlockType)
  type!: QuestionContentBlockType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  text?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assetId?: string;
  @ApiPropertyOptional({
    description: 'A rectangular string-cell matrix with a headerRow boolean',
  })
  @IsOptional()
  @IsObject()
  tableData?: { cells: string[][]; headerRow: boolean };
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  latex?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  mathml?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  altText?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  languageCode?: string;
}
export class CreateQuestionContextDto {
  @ApiPropertyOptional({ enum: QuestionContextType })
  @IsOptional()
  @IsEnum(QuestionContextType)
  type?: QuestionContextType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  body?: string;
  @ApiPropertyOptional({ type: [QuestionContentBlockDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  languageCode?: string;
}
export class UpdateQuestionContextDto {
  @ApiPropertyOptional({ enum: QuestionContextType })
  @IsOptional()
  @IsEnum(QuestionContextType)
  type?: QuestionContextType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  body?: string;
  @ApiPropertyOptional({
    type: [QuestionContentBlockDto],
    description: 'An empty array explicitly clears the context content',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(12)
  languageCode?: string;
}

export class CreateQuestionDto {
  @ApiProperty() @IsString() bankId!: string;
  @ApiProperty() @IsString() sourceId!: string;
  @ApiProperty() @IsString() courseId!: string;
  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;
  @ApiProperty({ type: [QuestionPlacementDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionPlacementDto)
  placements!: QuestionPlacementDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  body?: string;
  @ApiPropertyOptional({ type: [QuestionContentBlockDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  explanation?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextIds?: string[];
  @ApiPropertyOptional({ type: QuestionExplanationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionExplanationDto)
  structuredExplanation?: QuestionExplanationDto;
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPoints?: number;
  @ApiPropertyOptional({
    type: [String],
    description:
      'Accepted text answers for short-answer and fill-in-the-blank questions',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(10000, { each: true })
  acceptedAnswers?: string[];
  @ApiPropertyOptional({
    description: 'Required for long-answer questions before review',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  gradingRubric?: string;
  @ApiPropertyOptional({ enum: QuestionAnswerProvenance })
  @IsOptional()
  @IsEnum(QuestionAnswerProvenance)
  answerOrigin?: QuestionAnswerProvenance;
}
export class UpdateQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bankId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;
  @ApiPropertyOptional({ type: [QuestionPlacementDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionPlacementDto)
  placements?: QuestionPlacementDto[];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  body?: string;
  @ApiPropertyOptional({
    type: [QuestionContentBlockDto],
    description: 'An empty array explicitly clears the question content',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  explanation?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contextIds?: string[];
  @ApiPropertyOptional({ type: QuestionExplanationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionExplanationDto)
  structuredExplanation?: QuestionExplanationDto;
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPoints?: number;
  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(10000, { each: true })
  acceptedAnswers?: string[] | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  gradingRubric?: string | null;
  @ApiPropertyOptional({ enum: QuestionAnswerProvenance, nullable: true })
  @IsOptional()
  @IsEnum(QuestionAnswerProvenance)
  answerOrigin?: QuestionAnswerProvenance | null;
}
export class CreateQuestionOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body?: string;
  @ApiPropertyOptional({ type: [QuestionContentBlockDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCorrect?: boolean;
}
export class UpdateQuestionOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body?: string;
  @ApiPropertyOptional({
    type: [QuestionContentBlockDto],
    description: 'An empty array explicitly clears the option content',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuestionContentBlockDto)
  contentBlocks?: QuestionContentBlockDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCorrect?: boolean;
}
export class ReorderQuestionOptionsDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  optionIds!: string[];
}
export class ReorderQuestionAssetsDto {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  assetIds!: string[];
}
export class SetQuestionVideoLinkDto {
  @ApiProperty() @IsString() videoAssetId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) timestampSeconds!: number;
}
export class RejectQuestionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reviewNote!: string;
}
export class QueryQuestionDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: QuestionStatus })
  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() bankId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() academicGradeId?: string;
}
export class QueryQuestionSourceDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
  @ApiPropertyOptional({ enum: QuestionSourceType })
  @IsOptional()
  @IsEnum(QuestionSourceType)
  type?: QuestionSourceType;
}
export class QueryQuestionBankDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
