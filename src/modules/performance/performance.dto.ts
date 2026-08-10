import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { SearchPaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class PerformancePeriodQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class PerformanceAnalysisQueryDto extends SearchPaginationQueryDto {
  @IsEnum(['subject', 'chapter', 'lesson']) level:
    'subject' | 'chapter' | 'lesson' = 'subject';
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() chapterId?: string;
}
export class PerformanceTrendQueryDto extends PerformancePeriodQueryDto {
  @IsOptional() @IsString() assessmentId?: string;
}
export class PerformancePeersQueryDto {
  @IsString() subjectId!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() chapterId?: string;
}
export class PerformanceAnswerChangesQueryDto extends PerformancePeriodQueryDto {
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() chapterId?: string;
}
