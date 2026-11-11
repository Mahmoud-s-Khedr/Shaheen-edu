import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PurchaseEligibilityDto {
  @ApiProperty({ type: [String], enum: ['COURSE', 'CHAPTER', 'BUNDLE'] })
  @IsArray()
  @ArrayUnique()
  @IsIn(['COURSE', 'CHAPTER', 'BUNDLE'], { each: true })
  targetTypes!: string[];
  @ApiProperty({
    type: [String],
    description: 'Excluded COURSE:id, CHAPTER:id, or BUNDLE:id keys',
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  excludedTargets!: string[];
}
export class CreditPolicyDto extends PurchaseEligibilityDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({
    description:
      'Maximum share of eligible price payable with credit, in basis points',
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  maximumUsageBps!: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  maximumUsageMinor?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiryDays?: number | null;
}
export class PurchaseRewardPolicyDto extends PurchaseEligibilityDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) minimumPaymentMinor!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) rewardMinor!: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;
}
export class StudentReferralPolicyDto extends PurchaseRewardPolicyDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) invitedRewardMinor!: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  rewardLimit?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  perReferrerLimit?: number | null;
}
export class SaveStudentRewardsSettingsDto {
  @ApiProperty({ type: CreditPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreditPolicyDto)
  credit!: CreditPolicyDto;
  @ApiProperty({ type: PurchaseRewardPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PurchaseRewardPolicyDto)
  firstPurchase!: PurchaseRewardPolicyDto;
  @ApiProperty({ type: StudentReferralPolicyDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => StudentReferralPolicyDto)
  referral!: StudentReferralPolicyDto;
}
export class AdjustStudentCreditDto {
  @ApiProperty({
    description: 'Unique operation key; retry with the same payload',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key!: string;
  @ApiProperty({ description: 'Signed EGP minor units; cannot be zero' })
  @IsInt()
  @Min(-2147483647)
  @Max(2147483647)
  amountMinor!: number;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;
}
export class ReviewStudentReferralDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}
export class SetInviteCodeStatusDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class ExpiringStudentCreditDto {
  @ApiProperty() amountMinor!: number;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
}
export class StudentCreditBalanceDto {
  @ApiProperty({ example: 'EGP' }) currency!: string;
  @ApiProperty() availableMinor!: number;
  @ApiProperty() reservedMinor!: number;
  @ApiProperty() debtMinor!: number;
  @ApiProperty({ type: [ExpiringStudentCreditDto] })
  expiring!: ExpiringStudentCreditDto[];
}
export class StudentRewardsSettingsResponseDto {
  @ApiProperty() version!: number;
  @ApiProperty({ type: SaveStudentRewardsSettingsDto })
  config!: SaveStudentRewardsSettingsDto;
}
export class StudentInviteCodeDto {
  @ApiProperty() code!: string;
  @ApiProperty() isActive!: boolean;
}
export class StudentCreditEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() studentUserId!: string;
  @ApiProperty() key!: string;
  @ApiProperty({
    enum: [
      'GRANTED',
      'RESERVED',
      'SPENT',
      'RETURNED',
      'RELEASED',
      'EXPIRED',
      'ADJUSTED',
      'REVERSED',
    ],
  })
  type!: string;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() availableDeltaMinor!: number;
  @ApiProperty() reason!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderId!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}
export class StudentRewardsPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
export class StudentCreditHistoryDto {
  @ApiProperty({ type: [StudentCreditEntryDto] })
  data!: StudentCreditEntryDto[];
  @ApiProperty({ type: StudentRewardsPaginationDto })
  meta!: StudentRewardsPaginationDto;
}
export class StudentReferralSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}
export class StudentReferralAdminDto extends StudentReferralSummaryDto {
  @ApiProperty() invitedStudentId!: string;
  @ApiProperty() referrerStudentId!: string;
  @ApiProperty() codeOwnerId!: string;
  @ApiProperty({ type: String, nullable: true }) reviewReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedById!: string | null;
}
export class StudentReferralListDto {
  @ApiProperty({ type: [StudentReferralSummaryDto] })
  data!: StudentReferralSummaryDto[];
  @ApiProperty({ type: StudentRewardsPaginationDto })
  meta!: StudentRewardsPaginationDto;
}
export class StudentReferralAdminListDto {
  @ApiProperty({ type: [StudentReferralAdminDto] })
  data!: StudentReferralAdminDto[];
  @ApiProperty({ type: StudentRewardsPaginationDto })
  meta!: StudentRewardsPaginationDto;
}
export class StudentInviteCodeAdminDto extends StudentInviteCodeDto {
  @ApiProperty() studentUserId!: string;
}
