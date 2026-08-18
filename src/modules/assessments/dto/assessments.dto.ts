import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SearchPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  AssessmentMode,
  AssessmentStatus,
  QuestionContentBlockType,
  QuestionDifficultyBand,
  QuestionSourceType,
} from '../../../common/types/roles.enum';

export class AssessmentScopeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

/** A persisted scope has exactly one target; the other hierarchy IDs are null. */
export class AssessmentScopeResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true }) courseId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) courseName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) chapterId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) chapterName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lessonId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lessonName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sectionId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sectionName!:
    string | null;
}

class GenerateAssessmentSettingsDto {
  @ApiProperty({ minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  questionCount!: number;
  @ApiPropertyOptional({ enum: AssessmentMode, default: AssessmentMode.EXAM })
  @IsOptional()
  @IsEnum(AssessmentMode)
  mode?: AssessmentMode;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTimed?: boolean;
  @ApiPropertyOptional({ description: 'Required when isTimed is true' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  durationSeconds?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class GenerateStudentAssessmentDto extends GenerateAssessmentSettingsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  questionBankIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  courseIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chapterIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lessonIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceIds?: string[];
  @ApiPropertyOptional({ enum: QuestionSourceType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(QuestionSourceType, { each: true })
  sourceTypes?: QuestionSourceType[];
  @ApiPropertyOptional({ enum: QuestionDifficultyBand, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(QuestionDifficultyBand, { each: true })
  difficultyBands?: QuestionDifficultyBand[];
  @ApiPropertyOptional({
    enum: ['UNUSED', 'USED', 'CORRECT', 'INCORRECT', 'OMITTED', 'ALL'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  questionStatuses?: (
    'UNUSED' | 'USED' | 'CORRECT' | 'INCORRECT' | 'OMITTED' | 'ALL'
  )[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() markedOnly?: boolean;
}

export class GenerateAdminStandardAssessmentDto extends GenerateAssessmentSettingsDto {
  @ApiProperty({ type: [AssessmentScopeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentScopeDto)
  scopes!: AssessmentScopeDto[];
}

export class CreateCustomAssessmentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  questionIds!: string[];
  @ApiProperty({ type: [AssessmentScopeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentScopeDto)
  scopes!: AssessmentScopeDto[];
  @ApiPropertyOptional({ enum: AssessmentMode, default: AssessmentMode.EXAM })
  @IsOptional()
  @IsEnum(AssessmentMode)
  mode?: AssessmentMode;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isTimed?: boolean;
  @ApiPropertyOptional({ description: 'Required when isTimed is true' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  durationSeconds?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class RenameAssessmentDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title!: string;
}

export class UpdateQuestionNoteDto {
  @ApiProperty({ description: 'The student’s private note for this question' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class UpdateAdminAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional({ enum: AssessmentMode })
  @IsOptional()
  @IsEnum(AssessmentMode)
  mode?: AssessmentMode;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isTimed?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  durationSeconds?: number;
}

export class QueryAssessmentDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['ALL', 'SUSPENDED', 'COMPLETED'],
    description: "Filters by the student's own attempt status",
  })
  @IsOptional()
  @IsString()
  status?: 'ALL' | 'SUSPENDED' | 'COMPLETED';
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class QueryAdminAssessmentDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class AutosaveAnswerDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];
  @ApiPropertyOptional({
    description:
      'Written response for short, fill-in, and long-answer questions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  responseText?: string;
}

export class GradeLongAnswerDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  awardedPoints!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  feedback?: string;
}
export class ReportActiveTimeDto {
  @ApiProperty({
    minimum: 0,
    maximum: 86400,
    description: 'Monotonic active-time total for this question in seconds',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  activeSeconds!: number;
}

export class AssessmentResultQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'true' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeComparison?: 'true' | 'false';
}

export class AssessmentAnalyticsQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
}

export class AssessmentAnalyticsResponseDto {
  @ApiProperty({ enum: ['subject', 'chapter', 'topic'] }) level!:
    'subject' | 'chapter' | 'topic';
  @ApiProperty({
    type: [Object],
    description: 'The requested, paginated hierarchy rollup.',
  })
  data!: object[];
  @ApiProperty({
    type: [Object],
    description:
      'Completed attempts for the selected chapter; empty without chapterId.',
  })
  attempts!: object[];
  @ApiProperty({
    type: Object,
    description:
      'Pagination metadata for groups and, with chapterId, attempts.',
  })
  meta!: object;
}

/** Response models deliberately mirror the values returned by AssessmentsService. */
export class AssessmentListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['MINE', 'PUBLIC'] }) visibility!: 'MINE' | 'PUBLIC';
  @ApiProperty() generationType!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() isTimed!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) durationSeconds!:
    number | null;
  @ApiProperty() questionCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) attemptStatus!:
    string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) score!: number | null;
}

export class PaginatedAssessmentsResponseDto {
  @ApiProperty({ type: [AssessmentListItemDto] })
  data!: AssessmentListItemDto[];
  @ApiProperty() meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class AssessmentDetailDto extends AssessmentListItemDto {
  @ApiPropertyOptional({ type: String, nullable: true }) questionBankId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) questionBankName!:
    string | null;
  @ApiProperty({ type: [String] }) questionBankIds!: string[];
  @ApiProperty({ type: [Object] }) questionBanks!: {
    id: string;
    name: string;
  }[];
  @ApiPropertyOptional({ type: Object, nullable: true }) generationFilters!:
    object | null;
  @ApiProperty({ type: [AssessmentScopeResponseDto] })
  scopes!: AssessmentScopeResponseDto[];
}

export class AssessmentQuestionVideoDto {
  @ApiProperty() assetId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) assetName!:
    string | null;
  @ApiProperty() timestampSeconds!: number;
}

export class AssessmentQuestionAttachmentDto {
  @ApiProperty() assetId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() assetName!: string;
  @ApiProperty() sortOrder!: number;
}

export class AssessmentContentBlockDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: QuestionContentBlockType })
  type!: QuestionContentBlockType;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional({ nullable: true }) text?: string | null;
  @ApiPropertyOptional({ nullable: true }) assetId?: string | null;
  @ApiPropertyOptional({ nullable: true }) tableData?: object | null;
  @ApiPropertyOptional({ nullable: true }) latex?: string | null;
  @ApiPropertyOptional({ nullable: true }) mathml?: string | null;
  @ApiPropertyOptional({ nullable: true }) caption?: string | null;
  @ApiPropertyOptional({ nullable: true }) altText?: string | null;
  @ApiPropertyOptional({ nullable: true }) languageCode?: string | null;
  @ApiPropertyOptional({ type: Object, nullable: true }) asset?: {
    id: string;
    kind: string | null;
    filename: string | null;
  } | null;
}

export class AssessmentQuestionOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() body!: string;
  @ApiProperty() sortOrder!: number;
  @ApiPropertyOptional() isCorrect?: boolean;
  @ApiProperty({ type: [AssessmentContentBlockDto] })
  contentBlocks!: AssessmentContentBlockDto[];
}

export class AssessmentQuestionContextDto {
  @ApiProperty() id!: string;
  @ApiProperty() sourceContextId!: string;
  @ApiProperty() type!: string;
  @ApiPropertyOptional({ nullable: true }) title!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() languageCode!: string;
  @ApiProperty({ type: [AssessmentContentBlockDto] })
  contentBlocks!: AssessmentContentBlockDto[];
}

export class AssessmentAttemptQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() isMarked!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() type!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ type: AssessmentQuestionVideoDto, nullable: true })
  video!: AssessmentQuestionVideoDto | null;
  @ApiProperty({ type: [AssessmentQuestionAttachmentDto] })
  attachments!: AssessmentQuestionAttachmentDto[];
  @ApiProperty({ type: [AssessmentContentBlockDto] })
  contentBlocks!: AssessmentContentBlockDto[];
  @ApiProperty({ type: [AssessmentQuestionContextDto] })
  contexts!: AssessmentQuestionContextDto[];
  @ApiProperty({ type: [AssessmentQuestionOptionDto] })
  options!: AssessmentQuestionOptionDto[];
  @ApiProperty({ type: [String] }) selectedOptionIds!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) responseText!:
    string | null;
  @ApiProperty() maxPoints!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) awardedPoints!:
    number | null;
  @ApiProperty() answered!: boolean;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) isCorrect!:
    boolean | null;
  @ApiPropertyOptional({ type: [String], nullable: true }) correctOptionIds!:
    string[] | null;
  @ApiPropertyOptional({ type: String, nullable: true }) explanation!:
    string | null;
  @ApiPropertyOptional({ type: Object, nullable: true })
  structuredExplanation!: object | null;
  @ApiPropertyOptional({ type: String, nullable: true }) outcome!:
    string | null;
}

export class AssessmentAttemptStateDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty() totalQuestions!: number;
  @ApiProperty() totalPoints!: number;
  @ApiProperty() mode!: string;
  @ApiProperty({ type: [AssessmentAttemptQuestionDto] })
  questions!: AssessmentAttemptQuestionDto[];
}

export class AssessmentResultDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty() score!: number;
  @ApiProperty() totalQuestions!: number;
  @ApiProperty() percentage!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty() incorrectCount!: number;
  @ApiProperty() omittedCount!: number;
  @ApiProperty() answeredCount!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;
  @ApiProperty({ type: [Object] }) questions!: object[];
}

export class AdminAssessmentListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() generationType!: string;
  @ApiProperty() mode!: string;
  @ApiProperty() isTimed!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) durationSeconds!:
    number | null;
  @ApiProperty() questionCount!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
}

export class AdminAssessmentQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() type!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ nullable: true }) explanation!: string | null;
  @ApiPropertyOptional({ type: AssessmentQuestionVideoDto, nullable: true })
  video!: AssessmentQuestionVideoDto | null;
  @ApiProperty({ type: [AssessmentQuestionAttachmentDto] })
  attachments!: AssessmentQuestionAttachmentDto[];
  @ApiProperty({ type: [AssessmentContentBlockDto] })
  contentBlocks!: AssessmentContentBlockDto[];
  @ApiProperty({ type: [AssessmentQuestionContextDto] })
  contexts!: AssessmentQuestionContextDto[];
  @ApiProperty({ type: [AssessmentQuestionOptionDto] })
  options!: AssessmentQuestionOptionDto[];
}

export class AdminAssessmentDetailDto extends AdminAssessmentListItemDto {
  @ApiPropertyOptional({ nullable: true }) questionBankId!: string | null;
  @ApiPropertyOptional({ nullable: true }) questionBankName!: string | null;
  @ApiProperty({ type: [String] }) questionBankIds!: string[];
  @ApiProperty({ type: [Object] }) questionBanks!: {
    id: string;
    name: string;
  }[];
  @ApiProperty({ type: [AssessmentScopeResponseDto] })
  scopes!: AssessmentScopeResponseDto[];
  @ApiProperty({ type: [AdminAssessmentQuestionDto] })
  questions!: AdminAssessmentQuestionDto[];
}

export class PaginatedAdminAssessmentsResponseDto {
  @ApiProperty({ type: [AdminAssessmentListItemDto] })
  data!: AdminAssessmentListItemDto[];
  @ApiProperty() meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class IdDeletedResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() deleted!: boolean;
}
