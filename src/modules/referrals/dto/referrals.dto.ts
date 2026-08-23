import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ReferralCommissionKind } from '../../../common/types/roles.enum';

export class CreateReferralProgramDto {
  @ApiProperty() @IsString() @MaxLength(160) name!: string;
  @ApiProperty() @IsString() partnerUserId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() appliesToAll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perStudentUsageLimit?: number;
}

export class UpdateReferralProgramDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() appliesToAll?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() courseId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() chapterId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perStudentUsageLimit?: number | null;
}

export class CreateReferralCodeDto {
  @ApiProperty({ example: 'PARTNER10' }) @IsString() @MaxLength(80) code!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perStudentUsageLimit?: number;
}

export class UpdateReferralCodeDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() startsAt?: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) usageLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) perStudentUsageLimit?: number | null;
}

export class CreateReferralCommissionRuleDto {
  @ApiProperty({ enum: ReferralCommissionKind }) @IsEnum(ReferralCommissionKind) kind!: ReferralCommissionKind;
  @ApiPropertyOptional({ minimum: 0, maximum: 10000 }) @IsOptional() @IsInt() @Min(0) @Max(10_000) percentageBps?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) fixedCommissionMinor?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) maximumCommissionMinor?: number;
  @ApiPropertyOptional({ default: 'EGP' }) @IsOptional() @IsString() currency?: string;
  @ApiProperty({ type: String, format: 'date-time' }) @Type(() => Date) @IsDate() startsAt!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time' }) @IsOptional() @Type(() => Date) @IsDate() endsAt?: Date;
}

export class ReferralProgramsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() partnerUserId?: string;
}
