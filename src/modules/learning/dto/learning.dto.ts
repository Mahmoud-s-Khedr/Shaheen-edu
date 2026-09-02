import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';
import { EntitlementSource } from '../../../common/types/roles.enum';

export class PracticeScopeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

export class SubmitQuestionAttemptDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  optionIds!: string[];
}

export class UpdateContentStudyStateDto {
  @ApiPropertyOptional({
    type: Number,
    description: 'Video playback position in seconds. Send null to clear it.',
    minimum: 0,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  playbackPositionSeconds?: number | null;
}

/** Selects active analytics access by subject or one exact entitlement. */
export class ParentAnalyticsScopeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Aggregate every active access grant in this subject.',
  })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'Select one active entitlement exactly.',
  })
  @IsOptional()
  @IsString()
  entitlementId?: string;

  @ApiPropertyOptional({
    description:
      'Legacy selector. It resolves only when its linked entitlement is currently active.',
  })
  @IsOptional()
  @IsString()
  orderItemId?: string;
}

/** Pagination-only query for the active access-grant discovery endpoint. */
export class ParentAnalyticsScopesQueryDto extends PaginationQueryDto {}

export class ParentAnalyticsTargetDto {
  @ApiProperty({ enum: ['COURSE', 'CHAPTER'] }) type!: 'COURSE' | 'CHAPTER';
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

export class ParentAnalyticsAccessGrantDto {
  @ApiProperty() entitlementId!: string;
  @ApiProperty({ enum: EntitlementSource }) source!: EntitlementSource;
  @ApiProperty({ type: String, nullable: true }) orderId!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderItemId!: string | null;
  @ApiProperty({ type: ParentAnalyticsTargetDto })
  target!: ParentAnalyticsTargetDto;
}

export class ParentAnalyticsSubjectDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

export class ParentAnalyticsSubjectScopesDto {
  @ApiProperty({ type: ParentAnalyticsSubjectDto })
  subject!: ParentAnalyticsSubjectDto;
  @ApiProperty({ type: [ParentAnalyticsAccessGrantDto] })
  accessGrants!: ParentAnalyticsAccessGrantDto[];
}

export class ParentAnalyticsChildDto {
  @ApiProperty() userId!: string;
  @ApiProperty() fullName!: string;
}

export class ParentAnalyticsScopesResponseDto {
  @ApiProperty({ type: ParentAnalyticsChildDto })
  child!: ParentAnalyticsChildDto;
  @ApiProperty({ type: [ParentAnalyticsSubjectScopesDto] })
  data!: ParentAnalyticsSubjectScopesDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
