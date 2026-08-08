import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { EntitlementSource } from '../../../common/types/roles.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryEntitlementsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentUserId?: string;
}

export class GrantEntitlementDto {
  @ApiProperty()
  @IsString()
  studentUserId!: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GrantEntitlementDto) => !dto.chapterId)
  @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GrantEntitlementDto) => !dto.courseId)
  @IsString()
  chapterId?: string;

  @ApiPropertyOptional({ enum: EntitlementSource, default: EntitlementSource.ADMIN })
  @IsOptional()
  @IsEnum(EntitlementSource)
  source?: EntitlementSource;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
