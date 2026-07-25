import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ContentStatus, QuestionSourceType, QuestionStatus, QuestionType } from '../../../common/types/roles.enum';

export class CreateQuestionSourceDto {
  @ApiProperty({ enum: QuestionSourceType }) @IsEnum(QuestionSourceType) type!: QuestionSourceType;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @ApiPropertyOptional({ description: 'Required only for CONTENT_PUBLISHER sources' }) @IsOptional() @IsString() publisherUserId?: string;
}
export class UpdateQuestionSourceDto {
  @ApiPropertyOptional({ enum: QuestionSourceType }) @IsOptional() @IsEnum(QuestionSourceType) type?: QuestionSourceType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() publisherUserId?: string | null;
}
export class CreateQuestionBankDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string; @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string; }
export class UpdateQuestionBankDto { @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string; @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string | null; }
export class QuestionPlacementDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

export class CreateQuestionDto {
  @ApiProperty() @IsString() bankId!: string; @ApiProperty() @IsString() sourceId!: string; @ApiProperty() @IsString() courseId!: string;
  @ApiPropertyOptional({ enum: QuestionType }) @IsOptional() @IsEnum(QuestionType) type?: QuestionType;
  @ApiProperty({ type: [QuestionPlacementDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionPlacementDto) placements!: QuestionPlacementDto[];
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100000) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100000) explanation?: string;
}
export class UpdateQuestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() bankId?: string; @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string; @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional({ enum: QuestionType }) @IsOptional() @IsEnum(QuestionType) type?: QuestionType;
  @ApiPropertyOptional({ type: [QuestionPlacementDto] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuestionPlacementDto) placements?: QuestionPlacementDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100000) body?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100000) explanation?: string | null;
}
export class CreateQuestionOptionDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(10000) body!: string; @ApiPropertyOptional() @IsOptional() @IsBoolean() isCorrect?: boolean; }
export class UpdateQuestionOptionDto { @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(10000) body?: string; @ApiPropertyOptional() @IsOptional() @IsBoolean() isCorrect?: boolean; }
export class ReorderQuestionOptionsDto { @ApiProperty({ type: [String] }) @IsString({ each: true }) optionIds!: string[]; }
export class ReorderQuestionAssetsDto { @ApiProperty({ type: [String] }) @IsString({ each: true }) assetIds!: string[]; }
export class SetQuestionVideoLinkDto { @ApiProperty() @IsString() videoAssetId!: string; @ApiProperty() @Type(() => Number) @IsInt() @Min(0) timestampSeconds!: number; }
export class RejectQuestionDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) reviewNote!: string; }
export class QueryQuestionDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: QuestionStatus }) @IsOptional() @IsEnum(QuestionStatus) status?: QuestionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() bankId?: string; @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string; @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string; @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string; @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string; @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string; @ApiPropertyOptional() @IsOptional() @IsString() academicGradeId?: string;
}
export class QueryQuestionSourceDto extends PaginationQueryDto { @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus; @ApiPropertyOptional({ enum: QuestionSourceType }) @IsOptional() @IsEnum(QuestionSourceType) type?: QuestionSourceType; }
export class QueryQuestionBankDto extends PaginationQueryDto { @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus; }
