import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AssessmentMode, AssessmentStatus, QuestionDifficultyBand, QuestionSourceType } from '../../../common/types/roles.enum';

export class AssessmentScopeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

/** A persisted scope has exactly one target; the other hierarchy IDs are null. */
export class AssessmentScopeResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true }) courseId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) chapterId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lessonId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sectionId!: string | null;
}

export class GenerateStandardAssessmentDto {
  /** Legacy shape retained for admin generation. Student requests use the grouped ID arrays below. */
  @ApiPropertyOptional({ type: [AssessmentScopeDto] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssessmentScopeDto) scopes?: AssessmentScopeDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() questionBankId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) courseIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) chapterIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) lessonIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) sectionIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) sourceIds?: string[];
  @ApiPropertyOptional({ enum: QuestionSourceType, isArray: true }) @IsOptional() @IsArray() @IsEnum(QuestionSourceType, { each: true }) sourceTypes?: QuestionSourceType[];
  @ApiPropertyOptional({ enum: QuestionDifficultyBand, isArray: true }) @IsOptional() @IsArray() @IsEnum(QuestionDifficultyBand, { each: true }) difficultyBands?: QuestionDifficultyBand[];
  @ApiPropertyOptional({ enum: ['UNUSED', 'USED', 'CORRECT', 'INCORRECT', 'OMITTED', 'ALL'], isArray: true }) @IsOptional() @IsArray() @IsString({ each: true }) questionStatuses?: ('UNUSED' | 'USED' | 'CORRECT' | 'INCORRECT' | 'OMITTED' | 'ALL')[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() markedOnly?: boolean;
  @ApiProperty({ minimum: 1, maximum: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(50) questionCount!: number;
  @ApiPropertyOptional({ enum: AssessmentMode, default: AssessmentMode.EXAM }) @IsOptional() @IsEnum(AssessmentMode) mode?: AssessmentMode;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isTimed?: boolean;
  @ApiPropertyOptional({ description: 'Required when isTimed is true' }) @IsOptional() @Type(() => Number) @IsInt() @Min(30) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
}

export class CreateCustomAssessmentDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) questionIds!: string[];
  @ApiProperty({ type: [AssessmentScopeDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssessmentScopeDto) scopes!: AssessmentScopeDto[];
  @ApiPropertyOptional({ enum: AssessmentMode, default: AssessmentMode.EXAM }) @IsOptional() @IsEnum(AssessmentMode) mode?: AssessmentMode;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isTimed?: boolean;
  @ApiPropertyOptional({ description: 'Required when isTimed is true' }) @IsOptional() @Type(() => Number) @IsInt() @Min(30) durationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
}

export class RenameAssessmentDto { @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string; }

export class UpdateAdminAssessmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ enum: AssessmentMode }) @IsOptional() @IsEnum(AssessmentMode) mode?: AssessmentMode;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTimed?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(30) durationSeconds?: number;
}

export class QueryAssessmentDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'SUSPENDED', 'COMPLETED'], description: "Filters by the student's own attempt status" }) @IsOptional() @IsString() status?: 'ALL' | 'SUSPENDED' | 'COMPLETED';
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class QueryAdminAssessmentDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: AssessmentStatus }) @IsOptional() @IsEnum(AssessmentStatus) status?: AssessmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class AutosaveAnswerDto { @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) selectedOptionIds!: string[]; }

/** Response models deliberately mirror the values returned by AssessmentsService. */
export class AssessmentListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['MINE', 'PUBLIC'] }) visibility!: 'MINE' | 'PUBLIC';
  @ApiProperty() generationType!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() isTimed!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) durationSeconds!: number | null;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) attemptStatus!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) score!: number | null;
}

export class PaginatedAssessmentsResponseDto {
  @ApiProperty({ type: [AssessmentListItemDto] }) data!: AssessmentListItemDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class AssessmentDetailDto extends AssessmentListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) questionBankId!: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) generationFilters!: object | null;
  @ApiProperty({ type: [AssessmentScopeResponseDto] }) scopes!: AssessmentScopeResponseDto[];
}

export class AssessmentAttemptQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() type!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: [Object] }) options!: { id: string; body: string; sortOrder: number }[];
  @ApiProperty({ type: [String] }) selectedOptionIds!: string[];
  @ApiProperty() answered!: boolean;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) isCorrect!: boolean | null;
  @ApiPropertyOptional({ type: [String], nullable: true }) correctOptionIds!: string[] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) explanation!: string | null;
}

export class AssessmentAttemptStateDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) submittedAt!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty() totalQuestions!: number;
  @ApiProperty() mode!: string;
  @ApiProperty({ type: [AssessmentAttemptQuestionDto] }) questions!: AssessmentAttemptQuestionDto[];
}

export class AssessmentResultDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty() score!: number;
  @ApiProperty() totalQuestions!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) submittedAt!: Date | null;
  @ApiProperty({ type: [Object] }) questions!: object[];
}

export class AdminAssessmentListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() generationType!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() isTimed!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) durationSeconds!: number | null;
  @ApiProperty() questionCount!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) archivedAt!: Date | null;
}

export class PaginatedAdminAssessmentsResponseDto {
  @ApiProperty({ type: [AdminAssessmentListItemDto] }) data!: AdminAssessmentListItemDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
}

export class IdDeletedResponseDto { @ApiProperty() id!: string; @ApiProperty() deleted!: boolean; }
