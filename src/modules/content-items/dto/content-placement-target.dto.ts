import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ValidatorConstraint,
  Validate,
  IsOptional,
  IsString,
} from 'class-validator';

@ValidatorConstraint({ name: 'exactlyOneContentPlacementTarget', async: false })
export class ExactlyOneContentPlacementTargetConstraint {
  validate(value: ContentPlacementTargetDto): boolean {
    if (!value || typeof value !== 'object') return false;
    return (
      [value.courseId, value.chapterId, value.lessonId, value.sectionId].filter(
        (id) => typeof id === 'string' && id.trim().length > 0,
      ).length === 1
    );
  }

  defaultMessage(): string {
    return 'placement must include exactly one of courseId, chapterId, lessonId, or sectionId';
  }
}

export class ContentPlacementTargetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lessonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;
}

export class ValidatedContentPlacementTargetDto extends ContentPlacementTargetDto {
  @Validate(ExactlyOneContentPlacementTargetConstraint)
  declare courseId?: string;
}
