import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class PracticeScopeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lessonId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

export class SubmitQuestionAttemptDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @IsString({ each: true })
  optionIds!: string[];
}
