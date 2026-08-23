import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export const REPORT_TYPES = ['COMMERCE', 'PARTNER_OBLIGATIONS', 'REFERRAL_ALLOCATIONS', 'REFERRAL_SETTLEMENTS', 'ENTITLEMENTS'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export class PlatformReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() partnerUserId?: string;
}

export class CreateReportExportDto extends PlatformReportQueryDto {
  @ApiProperty({ enum: REPORT_TYPES }) @IsIn(REPORT_TYPES) reportType!: ReportType;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) columns!: string[];
  @ApiPropertyOptional({ description: 'Required by operational policy for a privileged export.' }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReportExportsQueryDto extends PaginationQueryDto {}
