import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentChannel,
} from '../../../common/types/roles.enum';

/** Reports are aggregate-only. Their matching CSVs contain source-record rows. */
export const REPORT_TYPES = [
  'COMMERCE',
  'PLATFORM_REVENUE',
  'REFUNDS',
  'PAYMENTS',
  'REGISTRATIONS',
  'ACTIVE_PURCHASERS',
  'ENTITLEMENT_LIFECYCLE',
  'PARTNER_OBLIGATIONS',
  'PUBLISHER_ALLOCATIONS',
  'PUBLISHER_SETTLEMENTS',
  'REFERRAL_ALLOCATIONS',
  'REFERRAL_SETTLEMENTS',
  'ENTITLEMENTS',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export class PlatformReportQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive Cairo calendar date.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

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
  gradeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  governorateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  centerId?: string;

  @ApiPropertyOptional({ enum: PaymentChannel })
  @IsOptional()
  @IsEnum(PaymentChannel)
  paymentChannel?: PaymentChannel;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @ApiPropertyOptional({ enum: PaymentAttemptStatus })
  @IsOptional()
  @IsEnum(PaymentAttemptStatus)
  paymentStatus?: PaymentAttemptStatus;

  @ApiPropertyOptional({ description: 'Discount campaign ID.' })
  @IsOptional()
  @IsString()
  promotionId?: string;

  @ApiPropertyOptional({ description: 'Coupon code, case-insensitive.' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ description: 'Publisher or referral partner user ID.' })
  @IsOptional()
  @IsString()
  partnerUserId?: string;
}

export class CreateReportExportDto extends PlatformReportQueryDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsIn(REPORT_TYPES)
  reportType!: ReportType;
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  columns!: string[];
  @ApiPropertyOptional({
    description: 'Required by operational policy for a privileged export.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReportExportsQueryDto extends PaginationQueryDto {}
