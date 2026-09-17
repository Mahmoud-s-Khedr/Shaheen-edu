import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@ValidatorConstraint({ name: 'hasVideoFeedbackContent', async: false })
class HasVideoFeedbackContentConstraint {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpsertVideoFeedbackDto;
    return (
      (typeof dto.comment === 'string' && dto.comment.trim().length > 0) ||
      dto.rating !== undefined
    );
  }

  defaultMessage(): string {
    return 'Provide at least one of comment or rating';
  }
}

export class UpsertVideoFeedbackDto {
  @ApiPropertyOptional({ maxLength: 4000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  comment?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  // This deliberately uses a DTO-only property so both public fields can be
  // independently optional while an empty request remains invalid.
  @Validate(HasVideoFeedbackContentConstraint)
  declare atLeastOne?: never;
}

export class QueryVideoFeedbackDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() videoAssetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contentItemId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() studentId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Inclusive Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
