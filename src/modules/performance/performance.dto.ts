import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SearchPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PerformancePeriodQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/** Curriculum scope. `section` is the product's analytics topic level. */
export class PerformanceScopeQueryDto extends PerformancePeriodQueryDto {
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() lessonId?: string;
  @IsOptional() @IsString() sectionId?: string;
}

export class PerformanceAnalysisQueryDto extends SearchPaginationQueryDto {
  @IsEnum({
    subject: 'subject',
    course: 'course',
    chapter: 'chapter',
    lesson: 'lesson',
    section: 'section',
  })
  level: 'subject' | 'course' | 'chapter' | 'lesson' | 'section' = 'subject';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() lessonId?: string;
  @IsOptional() @IsString() sectionId?: string;
}

export class PerformanceTrendQueryDto extends PerformanceScopeQueryDto {}
export class PerformanceInsightsQueryDto extends PerformanceScopeQueryDto {}

export class PerformancePeersQueryDto extends PerformancePeriodQueryDto {
  @IsString() subjectId!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() lessonId?: string;
  @IsOptional() @IsString() sectionId?: string;
}
export class PerformanceAnswerChangesQueryDto extends PerformanceScopeQueryDto {}
